// @sentropic/engram-live/integration — executable neutral factory
// (spec/SPEC_LIVE_GIT_INDEXING.md §2–3, §11; plan/09 L1b).
//
// The factory composes injected capabilities only: Git, filesystem, clock,
// content, fact-sink, cache and grammar ports. It never imports the
// monolithic root CLI, another @sentropic/* consumer package, the h2a host,
// a model module or a storage-driver handle — those stay outside the neutral
// closure by construction and by tests/live-neutrality.test.ts.
//
// The first delivered capability is code analysis using the host's parser.

import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADVERTISED_LANGUAGES,
  CAPABILITY_IDS,
  CONTRACT_VERSION,
  FACT_SCHEMA_VERSION,
  GRAMMAR_UNAVAILABLE_REASON,
  MAX_FACT_BATCH_BYTES,
  POLICY_VERSION,
  CONTENT_POLICY_VERSION,
  PRODUCER_NAME,
  describeCapabilities,
  isStrictBatchId,
  isStrictGenerationId,
  isStrictSnapshotId,
  type CapabilityId,
  type CapabilityStatus,
  type CodeAnalysisFactDto,
  type CoverageFactDto,
  type CoverageReport,
  type DeclarationRevocationDto,
  type FactSinkPort,
  type FactSinkReceipt,
  type GrammarCoverageDto,
  type HistoryPersistencePort,
  type LiveFactDto,
  type LiveScope,
  type QualifiedOid,
  type ReasonAnchorFactDto,
  type ReasonAnchorPinDto,
  type RevocationReason,
  type ScopeFencingTokenDto,
  type ValidationResult,
  type WorkspaceDeclarationDto,
  validateDeclarationRevocation,
  validateFactBatch,
  validateLiveFact,
  validateQualifiedOid,
  validateScopeFencingToken,
  validateWorkspaceDeclaration,
} from "./contracts.js";
import { buildFactBatch } from "./batch-codec.js";
import { classifyPath, containsSecretText } from "./content-policy.js";
import {
  analyzeCode,
  toReasonAnchorFact,
  type AnalyzeCodeInput,
  type AnalyzeCodeOutcome,
  type CodeAnalysisPorts,
  type GrammarStatusPort,
  type VerifiedCaptureEvidenceDto,
} from "./code-analysis.js";
import { toCodeAnalysisFact } from "./facts.js";
import { formatProducerGenerationId } from "./generation.js";
import {
  createLiveDeclaration,
  reviseLiveDeclaration,
  revokeLiveDeclaration,
  isSameClone,
  classifyLifecycleEvent,
  type CreateLiveDeclarationInput,
  type LiveDeclarationPatch,
} from "./registration.js";
import {
  runUnregisterPurge,
  type LatestSnapshotPort,
  type UnregisterPurgeOutcome,
} from "./snapshots.js";
import {
  composeFactoryGitExecutor,
  runGithubPrCapability,
  runHistoryDagCapability,
  runRefsCapability,
  runRetentionRequestsCapability,
  validateHostHooksIsolationDir,
  type CommittedBatchContext,
  type CommittedHistoryCapabilityResult,
  type ComposeGitExecutorOutcome,
  type DeliveredBatchSummary,
  type GitPort,
  type GithubPrCapabilityRequest,
  type GithubPrCapabilityResult,
  type HistoryDagCapabilityRequest,
  type HistoryDagCapabilityResult,
  type RefsCapabilityRequest,
  type RefsCapabilityResult,
  type RetentionRequestsCapabilityRequest,
  type RetentionRequestsCapabilityResult,
  type UnavailableCapabilityResult,
  type ValidateHooksIsolationOptions,
} from "./factory-history.js";
import {
  DEFAULT_FACTORY_RECONCILE_BUDGETS,
  DEFAULT_FACTORY_SCHEDULER_BUDGETS,
  DEFAULT_FACTORY_WATCH_BUDGETS,
  buildVerifiedCaptureEvidence,
  captureForLocalCodeAnalysis,
  createLocalSchedulingController,
  runDiffsCapability,
  runIndexSnapshotCapability,
  runPublicationCapability,
  runReconciliationCapability,
  runWorkingTreeCapability,
  type CachePort,
  type ContentPort,
  type DiffsCapabilityRequest,
  type DiffsCapabilityResult,
  type IndexSnapshotCapabilityRequest,
  type IndexSnapshotCapabilityResult,
  type LocalCapabilityResult,
  type LocalCaptureAnalysisOptions,
  type LocalPrivateBatchContext,
  type LocalRuntimeContext,
  type LocalSchedulingController,
  type PublicationCapabilityRequest,
  type PublicationCapabilityResult,
  type PublicationCompletionInput,
  type ReconciliationAction,
  type ReconciliationCapabilityRequest,
  type ReconciliationCapabilityResult,
  type SchedulerDurabilityPort,
  type SchedulingPort,
  type WorkingTreeCapabilityRequest,
  type WorkingTreeCapabilityResult,
} from "./factory-local.js";
import type { GenerationCompletionPort } from "./generation.js";
import { createProductionParseAdapter, supportsProductionParse } from "./parse-adapter.js";
import type { GithubPrTransportPort, PrSyncPersistencePort } from "./pr-sync.js";
import type { RetentionPort } from "./retention.js";
import type { WatchPort } from "./watch.js";
import type { CaptureResult } from "./worktree.js";

export { validateScopeFencingToken } from "./contracts.js";
export type { FactSinkPort, FactSinkReceipt, ScopeFencingTokenDto } from "./contracts.js";
export type { VerifiedCaptureEvidenceDto } from "./code-analysis.js";
export { composeFactoryGitExecutor, validateHostHooksIsolationDir } from "./factory-history.js";
export type {
  CommittedBatchContext,
  CommittedHistoryCapabilityResult,
  ComposeGitExecutorOutcome,
  DeliveredBatchSummary,
  GitPort,
  GithubPrCapabilityRequest,
  GithubPrCapabilityResult,
  HistoryDagCapabilityRequest,
  HistoryDagCapabilityResult,
  RefsCapabilityRequest,
  RefsCapabilityResult,
  RetentionRequestsCapabilityRequest,
  RetentionRequestsCapabilityResult,
  UnavailableCapabilityResult,
  ValidateHooksIsolationOptions,
} from "./factory-history.js";
export {
  DEFAULT_FACTORY_RECONCILE_BUDGETS,
  DEFAULT_FACTORY_SCHEDULER_BUDGETS,
  DEFAULT_FACTORY_WATCH_BUDGETS,
  buildVerifiedCaptureEvidence,
  captureForLocalCodeAnalysis,
  createLocalSchedulingController,
} from "./factory-local.js";
export type {
  CachePort,
  ContentPort,
  DiffsCapabilityRequest,
  DiffsCapabilityResult,
  IndexSnapshotCapabilityRequest,
  IndexSnapshotCapabilityResult,
  LocalCapabilityResult,
  LocalCaptureAnalysisOptions,
  LocalPrivateBatchContext,
  LocalRuntimeContext,
  LocalSchedulingController,
  PublicationCapabilityRequest,
  PublicationCapabilityResult,
  PublicationCompletionInput,
  ReconciliationAction,
  ReconciliationCapabilityRequest,
  ReconciliationCapabilityResult,
  SchedulerDurabilityPort,
  SchedulingPort,
  WorkingTreeCapabilityRequest,
  WorkingTreeCapabilityResult,
} from "./factory-local.js";

// — Injected ports. All ten neutral capabilities consume typed host ports
// (Git, GitHub PR, history persistence, retention, L4b content protection &
// latest-only snapshots, L5 analysis cache, L6b watch & scheduler, and
// L3a-E2 generation completion).

export interface FilesystemPort {
  /** Reads a file's bytes through the injected host filesystem. */
  readFileBytes(path: string): Promise<Uint8Array>;
}

export interface ClockPort {
  /** Milliseconds since the Unix epoch, host-supplied and test-fakeable. */
  now(): number;
  /** Optional host-injected deadline/polling timer used by L6b scheduling and publication. */
  schedule?(ms: number, callback: () => void): () => void;
}

/**
 * Required S-side storage contract for L3a / L3b-S (Opus Amendment 2):
 * Every storage write, cursor update, and generation publication MUST atomically
 * verify the caller's ScopeFencingTokenDto against the active writer lease and
 * storage-owned projection incarnation P inside the storage transaction.
 */
export interface StorageIncarnationPort {
  incarnation(): string;
  hasGeneration(incarnation: string, generationId: string): boolean;
  validateFencingToken(token: ScopeFencingTokenDto, nowMs: number): ValidationResult;
}

export const REQUIRED_STORAGE_FENCING_CONTRACT = {
  enforcedByLots: ["L3a", "L3b-S"] as const,
  requireAtomicLeaseCheckOnFactWrite: true,
  requireAtomicLeaseCheckOnCursorWrite: true,
  requireAtomicLeaseCheckOnGenerationPublish: true,
  requireStorageOwnedIncarnationBinding: true,
  requireAtomicLeaseCheckOnProgressReadWrite: true,
  requireAtomicLeaseCheckOnPark: true,
  requireAtomicLeaseCheckOnRelationRepair: true,
  requireAtomicLeaseCheckOnMarkerDelete: true,
  requireSourceAndProjectionEqualityOnGenerationPublish: true,
  requireSynchronousLeaseRevocationOnShutdown: true,
} as const;

export interface GrammarSyntaxPoint {
  readonly row: number;
  readonly column: number;
}

/** Structural tree-sitter node interface for a parser taking a JS string. */
export interface GrammarSyntaxNode {
  readonly type: string;
  readonly text: string;
  /** Indices are UTF-16 offsets into the exact string supplied to parse. */
  readonly startIndex: number;
  readonly endIndex: number;
  readonly startPosition: GrammarSyntaxPoint;
  readonly endPosition: GrammarSyntaxPoint;
  readonly isNamed: boolean;
  readonly hasError: boolean;
  readonly isMissing: boolean;
  readonly children: readonly GrammarSyntaxNode[];
  readonly namedChildren: readonly GrammarSyntaxNode[];
  readonly parent: GrammarSyntaxNode | null;
  readonly nextNamedSibling: GrammarSyntaxNode | null;
  childForFieldName(name: string): GrammarSyntaxNode | null;
  descendantsOfType(types: string | string[], start?: GrammarSyntaxPoint, end?: GrammarSyntaxPoint): GrammarSyntaxNode[];
}

export interface GrammarSyntaxTree {
  readonly rootNode: GrammarSyntaxNode;
  delete(): void;
}

export interface GrammarParser {
  parse(content: string): GrammarSyntaxTree | null;
  delete(): void;
}

export interface GrammarRuntimePort {
  init(): void | Promise<void>;
  /** Loads the exact WASM bytes after the package has verified their digest. */
  loadLanguage(wasm: Uint8Array): Promise<object>;
  /** Returns a fresh parser already bound to this runtime's grammar handle. */
  createParser(grammar: object): GrammarParser;
}

export interface LiveFactoryPorts {
  /** Host-injected Git capability (SafeGitExecutor options/instance + GitProcessPort). */
  readonly git?: GitPort;
  readonly filesystem: FilesystemPort;
  readonly clock: ClockPort;
  /** Host-injected L4b content protection, key provider and latest-only snapshot store. */
  readonly content?: ContentPort;
  /** Single L5-P-m8 fenced fact-batch sink port. */
  readonly factSink: FactSinkPort;
  /** Host-injected L5 analysis cache port (authorize/load/store). */
  readonly cache?: CachePort;
  readonly grammarRuntime: GrammarRuntimePort;
  /** Host-injected durable completion and retained-root state port (L2b). */
  readonly historyPersistence?: HistoryPersistencePort;
  /** Host-injected GitHub PR pagination transport (P1; no network in engram). */
  readonly githubPr?: GithubPrTransportPort;
  /** Host-injected durable PR cursor/observation/object-job state port (P1). */
  readonly prPersistence?: PrSyncPersistencePort;
  /** Host-injected private root retention port (R1). */
  readonly retention?: RetentionPort;
  /** Host-injected native watch port (L6b). */
  readonly watch?: WatchPort;
  /** Host-injected L6b scheduler, writer authority, marker store and reconcile scan ports. */
  readonly scheduling?: SchedulingPort;
  /** Host-injected L3a-E2 generation completion port for fenced publication. */
  readonly generationCompletion?: GenerationCompletionPort;
}

export interface CreateLiveFactoryOptions {
  readonly ports: LiveFactoryPorts;
  readonly declaration: WorkspaceDeclarationDto;
}

export interface CodeAnalysisRequest {
  readonly input: AnalyzeCodeInput;
  readonly objects: CodeAnalysisPorts["objects"];
  readonly cache?: CodeAnalysisPorts["cache"];
  /** Optional live L4a worktree capture to supply verified capture evidence for local (treeOid === null) analysis. */
  readonly capture?: LocalCaptureAnalysisOptions;
  /** Optional L9-E / L3a-E2 fenced delivery controls for emitting CodeAnalysisFactDto batches via FactSinkPort. */
  readonly generationId?: string;
  readonly fencingToken?: ScopeFencingTokenDto;
  readonly expectedIncarnation?: string;
  readonly batchId?: string;
  readonly maxBatchBytes?: number;
  readonly commit?: QualifiedOid | null;
  readonly blob?: QualifiedOid | null;
  readonly pathBytes?: Uint8Array;
  readonly reasonAnchors?: readonly ReasonAnchorPinDto[];
}

export interface DisableProducerRequest {
  readonly reason?: RevocationReason;
  readonly revocation?: DeclarationRevocationDto;
  readonly generationId?: string;
  readonly store?: LatestSnapshotPort;
}

export interface DisableProducerResult {
  readonly disabled: true;
  readonly declarationId: string;
  readonly cloneId: string;
  readonly worktreeId: string;
  readonly declarationRevision: number;
  readonly revocation: DeclarationRevocationDto;
  readonly shutdownCompleted: boolean;
  readonly purgeOutcome: UnregisterPurgeOutcome | null;
  readonly preservedCommittedHistory: true;
}

export type CapabilityRequest =
  | CodeAnalysisRequest
  | RefsCapabilityRequest
  | HistoryDagCapabilityRequest
  | GithubPrCapabilityRequest
  | RetentionRequestsCapabilityRequest
  | IndexSnapshotCapabilityRequest
  | WorkingTreeCapabilityRequest
  | DiffsCapabilityRequest
  | ReconciliationCapabilityRequest
  | PublicationCapabilityRequest;

export interface CodeAnalysisCapabilityResult extends CapabilityStatus {
  readonly capability: "code-analysis";
  readonly state: "available";
  readonly delivered: true;
  readonly languages: readonly GrammarCoverageDto[];
  /** Present when a code-analysis request was supplied. */
  readonly analysis?: AnalyzeCodeOutcome;
  /** Present when a live L4a capture was executed to verify local analysis bounds. */
  readonly capture?: CaptureResult;
  /** Present when fenced FactSinkPort delivery was requested on this code-analysis invocation. */
  readonly generationId?: string;
  readonly batches?: readonly DeliveredBatchSummary[];
}

export type CapabilityResult =
  | UnavailableCapabilityResult
  | CodeAnalysisCapabilityResult
  | RefsCapabilityResult
  | HistoryDagCapabilityResult
  | GithubPrCapabilityResult
  | RetentionRequestsCapabilityResult
  | IndexSnapshotCapabilityResult
  | WorkingTreeCapabilityResult
  | DiffsCapabilityResult
  | ReconciliationCapabilityResult
  | PublicationCapabilityResult;

export type GrammarLoadResult = { readonly language: string } & (
  | { readonly state: "available"; readonly bytesSha256: string; readonly grammar: object }
  | { readonly state: "unavailable"; readonly reason: string }
);

export interface LiveFactory {
  describeCapabilities(): readonly CapabilityStatus[];
  runCapability(capability: "code-analysis", request?: CodeAnalysisRequest): Promise<CodeAnalysisCapabilityResult | UnavailableCapabilityResult>;
  runCapability(capability: "refs", request?: RefsCapabilityRequest): Promise<RefsCapabilityResult | UnavailableCapabilityResult>;
  runCapability(capability: "history-dag", request?: HistoryDagCapabilityRequest): Promise<HistoryDagCapabilityResult | UnavailableCapabilityResult>;
  runCapability(capability: "github-pr", request?: GithubPrCapabilityRequest): Promise<GithubPrCapabilityResult | UnavailableCapabilityResult>;
  runCapability(capability: "retention-requests", request?: RetentionRequestsCapabilityRequest): Promise<RetentionRequestsCapabilityResult | UnavailableCapabilityResult>;
  runCapability(capability: "index-snapshot", request?: IndexSnapshotCapabilityRequest): Promise<IndexSnapshotCapabilityResult | UnavailableCapabilityResult>;
  runCapability(capability: "working-tree", request?: WorkingTreeCapabilityRequest): Promise<WorkingTreeCapabilityResult | UnavailableCapabilityResult>;
  runCapability(capability: "diffs", request?: DiffsCapabilityRequest): Promise<DiffsCapabilityResult | UnavailableCapabilityResult>;
  runCapability(capability: "reconciliation", request?: ReconciliationCapabilityRequest): Promise<ReconciliationCapabilityResult | UnavailableCapabilityResult>;
  runCapability(capability: "publication", request?: PublicationCapabilityRequest): Promise<PublicationCapabilityResult | UnavailableCapabilityResult>;
  runCapability(capability: CapabilityId, request?: CapabilityRequest): Promise<CapabilityResult>;
  grammarCoverage(language: string): GrammarCoverageDto;
  grammarCoverageReport(language: string): CoverageReport;
  loadGrammar(language: string): Promise<GrammarLoadResult>;
  validateBatch(batch: unknown): ValidationResult;
  disable(request?: DisableProducerRequest): Promise<DisableProducerResult>;
}

interface GrammarManifestEntry {
  readonly file: string;
  readonly sourceVersion: string;
  readonly sha256: string;
  readonly bytes: number;
}

interface GrammarManifest {
  readonly manifestVersion: number;
  readonly languages: Readonly<Record<string, GrammarManifestEntry>>;
}

function decodeJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Refuse malformed pins and paths outside the packaged grammar directory.
function isGrammarManifest(value: unknown): value is GrammarManifest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { manifestVersion?: unknown; languages?: unknown };
  if (typeof candidate.manifestVersion !== "number") return false;
  if (typeof candidate.languages !== "object" || candidate.languages === null || Array.isArray(candidate.languages)) {
    return false;
  }
  return Object.entries(candidate.languages).every(([language, entry]) => {
    if (typeof entry !== "object" || entry === null) return false;
    const pinned = entry as Record<string, unknown>;
    return /^[a-z]+$/.test(language) && pinned.file === "tree-sitter-" + language + ".wasm"
      && typeof pinned.sha256 === "string" && /^[0-9a-f]{64}$/.test(pinned.sha256)
      && typeof pinned.sourceVersion === "string" && pinned.sourceVersion.length > 0
      && typeof pinned.bytes === "number" && Number.isSafeInteger(pinned.bytes) && pinned.bytes > 0;
  });
}

type ManifestOutcome = { readonly ok: true; readonly manifest: GrammarManifest }
  | { readonly ok: false; readonly reason: string };

type GrammarProbe = Extract<GrammarLoadResult, { state: "unavailable" }>
  | (Extract<GrammarLoadResult, { state: "available" }> & { readonly bytes: Uint8Array; readonly version: string });

function grammarCoverageFor(result: GrammarLoadResult): GrammarCoverageDto {
  const { language } = result;
  return result.state === "available"
    ? { axis: "ast", language, state: "current", reason: `packaged grammar verified (sha256 ${result.bytesSha256})` }
    : { axis: "ast", language, state: "unavailable", reason: result.reason };
}

export function createLiveFactory(options: CreateLiveFactoryOptions): LiveFactory {
  const declarationCheck = validateWorkspaceDeclaration(options.declaration);
  if (!declarationCheck.ok) {
    throw new Error(`invalid live workspace declaration: ${declarationCheck.errors.join("; ")}`);
  }
  const declaration = structuredClone(options.declaration);
  const ports = options.ports;
  const distDir = dirname(fileURLToPath(import.meta.url));
  const manifestPath = join(distDir, "..", "grammar-manifest.json");
  const grammarDir = join(distDir, "grammars");

  const scope = { tenant: declaration.tenant, clone: declaration.cloneId };
  const declaredWorktreeId = declaration.worktreeId;
  const runtime = ports.grammarRuntime;
  let runtimeInit: Promise<void> | undefined;
  const loadManifest = async (): Promise<ManifestOutcome> => {
    let decoded: unknown;
    try {
      decoded = decodeJson(await ports.filesystem.readFileBytes(manifestPath));
    } catch (error) {
      return {
        ok: false,
        reason: `the pinned grammar manifest cannot be read through the filesystem port (${errorMessage(error)})`,
      };
    }
    if (!isGrammarManifest(decoded)) {
      return {
        ok: false,
        reason: "the pinned grammar manifest is invalid: a manifestVersion number and a languages record pinning file/sha256 entries are required",
      };
    }
    return { ok: true, manifest: decoded };
  };

  const latestGrammarCoverage = new Map<string, GrammarCoverageDto>();
  const grammarHandles = new Map<string, { digest: string; handle: Promise<object> }>();
  const extractor = createProductionParseAdapter(runtime);

  function loadHandle(language: string, bytes: Uint8Array, digest: string): Promise<object> {
    if (disabledRevocation !== null) {
      return Promise.reject(new Error("producer declaration disabled/revoked"));
    }
    const cached = grammarHandles.get(language);
    if (cached?.digest === digest) return cached.handle;
    runtimeInit ??= Promise.resolve().then(() => runtime.init?.()).catch((error: unknown) => {
      runtimeInit = undefined;
      throw error;
    });
    const handle = runtimeInit.then(async () => {
      if (disabledRevocation !== null) {
        throw new Error("producer declaration disabled/revoked");
      }
      const grammar = await runtime.loadLanguage(Uint8Array.from(bytes));
      if (disabledRevocation !== null) {
        throw new Error("producer declaration disabled/revoked");
      }
      if (!grammar || typeof grammar !== "object") throw new Error("no grammar handle");
      return grammar;
    }).catch((error: unknown) => {
      if (grammarHandles.get(language)?.handle === handle) grammarHandles.delete(language);
      throw error;
    });
    grammarHandles.set(language, { digest, handle });
    return handle;
  }

  async function probeGrammar(language: string, manifestOutcome: ManifestOutcome, forAnalysis: boolean): Promise<GrammarProbe> {
    const unavailable = (reason: string): GrammarProbe => ({ language, state: "unavailable", reason });
    if (forAnalysis && !supportsProductionParse(language)) {
      return unavailable(`no production parse adapter is available for "${language}"`);
    }
    if (!manifestOutcome.ok) {
      return unavailable(`${GRAMMAR_UNAVAILABLE_REASON}: ${manifestOutcome.reason}`);
    }
    if (!Object.hasOwn(manifestOutcome.manifest.languages, language)) {
      return unavailable(`${GRAMMAR_UNAVAILABLE_REASON}: "${language}" is absent from the pinned grammar manifest`);
    }
    const entry = manifestOutcome.manifest.languages[language];
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(await ports.filesystem.readFileBytes(join(grammarDir, entry.file)));
    } catch (error) {
      return unavailable(
        `${GRAMMAR_UNAVAILABLE_REASON}: the packaged WASM for "${language}" cannot be read through the filesystem port (${errorMessage(error)})`,
      );
    }
    const digest = sha256(bytes);
    if (digest !== entry.sha256 || bytes.byteLength !== entry.bytes) {
      return unavailable(`packaged grammar digest or size mismatch for "${language}": pinned ${entry.sha256}, read ${digest}`);
    }
    try {
      const grammar = await loadHandle(language, bytes, digest);
      if (forAnalysis) runtime.createParser(grammar).delete();
      return { language, state: "available", bytesSha256: digest, grammar, bytes, version: entry.sourceVersion };
    } catch (error) {
      return unavailable(`grammar runtime rejected the packaged WASM for "${language}": ${errorMessage(error)}`);
    }
  }

  // The analysis engine independently validates the same operation-pinned
  // bytes before receiving the runtime handle.
  function grammarFor(probe: GrammarProbe): GrammarStatusPort {
    if (probe.state === "unavailable") {
      return { status: () => ({ state: "unavailable", version: "unavailable", reason: probe.reason }) };
    }
    const abi = "tree-sitter-wasm/1";
    return {
      status: () => ({ state: "available", version: probe.version, abi,
        bytes: probe.bytes, digest: probe.bytesSha256, grammarId: `tree-sitter-${probe.language}` }),
      load: ({ bytes, language }) => language === probe.language && sha256(bytes) === probe.bytesSha256 ? probe.grammar : null,
    };
  }

  const historyContext = {
    declaration,
    clock: ports.clock,
    git: ports.git,
    factSink: ports.factSink,
    historyPersistence: ports.historyPersistence,
    githubPr: ports.githubPr,
    prPersistence: ports.prPersistence,
    retention: ports.retention,
  };

  const localContext: LocalRuntimeContext = {
    declaration,
    clock: ports.clock,
    git: ports.git,
    content: ports.content,
    factSink: ports.factSink,
    watch: ports.watch,
    scheduling: ports.scheduling,
    generationCompletion: ports.generationCompletion,
  };
  const schedulingController = createLocalSchedulingController(localContext);
  let disabledRevocation: DeclarationRevocationDto | null = null;

  interface PreparedCodeDelivery {
    readonly generationId: string;
    readonly batchId: string;
    readonly maxBatchBytes: number;
    readonly expectedScope: LiveScope;
    readonly expectedIncarnation?: string;
    readonly fencingToken: ScopeFencingTokenDto;
    readonly policyVersion: typeof POLICY_VERSION | typeof CONTENT_POLICY_VERSION;
    readonly commit?: QualifiedOid | null;
    readonly blob?: QualifiedOid | null;
    readonly pathBytes?: Uint8Array;
    readonly reasonAnchorFacts: readonly ReasonAnchorFactDto[];
  }

  const HEX_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
  const HEX_64 = /^[0-9a-f]{64}$/;

  function safePolicyReason(detail: string): string {
    return containsSecretText(detail) ? "operation refused by content policy" : detail;
  }

  function readValidClockNowMs():
    | { readonly ok: true; readonly nowMs: number }
    | { readonly ok: false; readonly reason: string } {
    if (!ports.clock || typeof ports.clock.now !== "function") {
      return { ok: false, reason: "missing host clock port (ports.clock.now)" };
    }
    let nowMs: number;
    try {
      nowMs = ports.clock.now();
    } catch (error) {
      return { ok: false, reason: `host clock port refused: ${safePolicyReason(errorMessage(error))}` };
    }
    if (typeof nowMs !== "number" || !Number.isSafeInteger(nowMs) || nowMs <= 0) {
      return { ok: false, reason: "host clock port must return a positive safe-integer Unix millisecond timestamp" };
    }
    return { ok: true, nowMs };
  }

  function cloneScopeFencingToken(token: ScopeFencingTokenDto): ScopeFencingTokenDto {
    return {
      tokenId: token.tokenId,
      scope: {
        tenant: token.scope.tenant,
        clone: token.scope.clone,
        ...(token.scope.worktree !== undefined ? { worktree: token.scope.worktree } : {}),
      },
      epoch: token.epoch,
      epochId: token.epochId,
      declarationRevision: token.declarationRevision,
      projectionIncarnation: token.projectionIncarnation,
      issuedAt: token.issuedAt,
      expiresAt: token.expiresAt,
    };
  }

  function cloneQualifiedOidOrNull(oid: QualifiedOid | null | undefined): QualifiedOid | null | undefined {
    if (oid === undefined || oid === null) return oid;
    return { algorithm: oid.algorithm, oid: oid.oid };
  }

  function screenLocalAnalysisOutputs(analysis: AnalyzeCodeOutcome): string | null {
    for (const sym of analysis.symbols) {
      if (
        containsSecretText(sym.name) ||
        containsSecretText(sym.slot) ||
        containsSecretText(sym.path) ||
        !classifyPath(sym.path).allowed
      ) {
        return `local code-analysis symbol refused by content policy (${CONTENT_POLICY_VERSION})`;
      }
    }
    for (const call of analysis.calls) {
      if (
        containsSecretText(call.from) ||
        containsSecretText(call.target) ||
        containsSecretText(call.path) ||
        !classifyPath(call.path).allowed
      ) {
        return `local code-analysis call refused by content policy (${CONTENT_POLICY_VERSION})`;
      }
    }
    for (const edge of analysis.inheritances) {
      if (
        containsSecretText(edge.child) ||
        containsSecretText(edge.parent) ||
        containsSecretText(edge.path) ||
        !classifyPath(edge.path).allowed
      ) {
        return `local code-analysis inheritance refused by content policy (${CONTENT_POLICY_VERSION})`;
      }
    }
    for (const item of analysis.unresolved) {
      if (containsSecretText(item.name) || containsSecretText(item.reason)) {
        return `local code-analysis unresolved entry refused by content policy (${CONTENT_POLICY_VERSION})`;
      }
    }
    return null;
  }

  function wantsCodeDelivery(codeReq: CodeAnalysisRequest | undefined): boolean {
    if (!codeReq) return false;
    return (
      codeReq.generationId !== undefined ||
      codeReq.fencingToken !== undefined ||
      codeReq.expectedIncarnation !== undefined ||
      codeReq.batchId !== undefined ||
      codeReq.maxBatchBytes !== undefined ||
      codeReq.commit !== undefined ||
      codeReq.blob !== undefined ||
      codeReq.pathBytes !== undefined ||
      codeReq.reasonAnchors !== undefined
    );
  }

  function validateCodeDelivery(
    codeReq: CodeAnalysisRequest,
  ): { readonly ok: true; readonly prepared: PreparedCodeDelivery } | { readonly ok: false; readonly reason: string } {
    if (disabledRevocation !== null) {
      return { ok: false, reason: "producer declaration disabled/revoked" };
    }
    if (!ports.factSink || typeof ports.factSink.deliver !== "function") {
      return { ok: false, reason: "missing host fact sink port (ports.factSink.deliver)" };
    }
    const clockCheck = readValidClockNowMs();
    if (!clockCheck.ok) return clockCheck;
    const nowMs = clockCheck.nowMs;
    if (!codeReq.objects || typeof codeReq.objects.loadBlob !== "function") {
      return { ok: false, reason: "code-analysis delivery requires an injected retained-object port (objects.loadBlob)" };
    }
    const generationId = codeReq.generationId;
    if (!isStrictGenerationId(generationId)) {
      return { ok: false, reason: 'code-analysis request.generationId must be a strict fixed-width generation id ("gen:" plus 10 digits)' };
    }
    const genDigits = generationId.slice("gen:".length);
    const batchId = codeReq.batchId ?? `batch:code-analysis:${genDigits}:000001`;
    if (!isStrictBatchId(batchId, "batch:")) {
      return { ok: false, reason: 'code-analysis request.batchId must be a strict opaque batch id starting with "batch:"' };
    }
    const maxBatchBytes = codeReq.maxBatchBytes ?? MAX_FACT_BATCH_BYTES;
    if (typeof maxBatchBytes !== "number" || !Number.isSafeInteger(maxBatchBytes) || maxBatchBytes <= 0 || maxBatchBytes > MAX_FACT_BATCH_BYTES) {
      return { ok: false, reason: `code-analysis request.maxBatchBytes must be a positive safe integer <= ${MAX_FACT_BATCH_BYTES}` };
    }
    const expectedIncarnation = codeReq.expectedIncarnation;
    if (expectedIncarnation !== undefined && (typeof expectedIncarnation !== "string" || expectedIncarnation.length === 0)) {
      return { ok: false, reason: "code-analysis request.expectedIncarnation must be a non-empty string when present" };
    }

    const input = codeReq.input;
    if (typeof input.language !== "string" || input.language.length === 0 || input.language.includes("\0")) {
      return { ok: false, reason: "code-analysis input.language must be a non-empty string without NUL" };
    }
    if (typeof input.path !== "string" || input.path.length === 0 || input.path.includes("\0")) {
      return { ok: false, reason: "code-analysis input.path must be a non-empty string without NUL" };
    }
    if (typeof input.content !== "string") {
      return { ok: false, reason: "code-analysis input.content must be a string" };
    }
    if (typeof input.configHash !== "string" || !HEX_64.test(input.configHash)) {
      return { ok: false, reason: "code-analysis input.configHash must be a 64-character lowercase hex digest" };
    }
    if (typeof input.dependencyHash !== "string" || !HEX_64.test(input.dependencyHash)) {
      return { ok: false, reason: "code-analysis input.dependencyHash must be a 64-character lowercase hex digest" };
    }
    if (input.treeOid !== null && (typeof input.treeOid !== "string" || !HEX_OID.test(input.treeOid))) {
      return { ok: false, reason: "code-analysis input.treeOid must be null or a 40/64-character lowercase hex OID" };
    }

    const isCommitted = input.treeOid !== null;
    if (isCommitted && input.snapshotId != null) {
      return { ok: false, reason: "committed code-analysis compatibility delivery cannot reference a local snapshotId" };
    }
    if (!isCommitted) {
      if (!isStrictSnapshotId(input.snapshotId)) {
        return { ok: false, reason: "local code-analysis delivery requires a valid non-null lsnap snapshotId" };
      }
      if (codeReq.reasonAnchors !== undefined || codeReq.commit !== undefined) {
        return { ok: false, reason: "local snapshot-bound code-analysis delivery cannot attach committed commit or reasonAnchors" };
      }
      const pathPolicy = classifyPath(input.path);
      if (!pathPolicy.allowed) {
        return { ok: false, reason: `local code-analysis delivery refused: ${pathPolicy.reason}` };
      }
      if (containsSecretText(input.language) || containsSecretText(input.path) || containsSecretText(input.content)) {
        return { ok: false, reason: `local code-analysis delivery refused by content policy (${CONTENT_POLICY_VERSION})` };
      }
    }

    let clonedPathBytes: Uint8Array | undefined;
    if (codeReq.pathBytes !== undefined) {
      if (!(codeReq.pathBytes instanceof Uint8Array) || !ArrayBuffer.isView(codeReq.pathBytes)) {
        return { ok: false, reason: "code-analysis request.pathBytes must be a Uint8Array when present" };
      }
      clonedPathBytes = Uint8Array.from(codeReq.pathBytes);
      if (clonedPathBytes.byteLength === 0 || clonedPathBytes.includes(0)) {
        return { ok: false, reason: "code-analysis request.pathBytes must be non-empty and NUL-free" };
      }
      if (!isCommitted) {
        const pathBytesPolicy = classifyPath(clonedPathBytes);
        if (!pathBytesPolicy.allowed) {
          return { ok: false, reason: `local code-analysis delivery refused: ${pathBytesPolicy.reason}` };
        }
      }
    }

    const expectedScope: LiveScope = isCommitted
      ? { tenant: declaration.tenant, clone: declaration.cloneId }
      : { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaredWorktreeId };
    const token = codeReq.fencingToken;
    const tokenCheck = validateScopeFencingToken(token, expectedScope, expectedIncarnation, nowMs);
    if (!tokenCheck.ok) {
      return { ok: false, reason: `code-analysis fencing token rejected: ${tokenCheck.errors.join("; ")}` };
    }
    if (token!.declarationRevision !== declaration.declarationRevision) {
      return { ok: false, reason: "code-analysis fencing token declarationRevision mismatch" };
    }
    const clonedToken = cloneScopeFencingToken(token!);

    const expectedAlg = isCommitted ? (input.treeOid!.length === 64 ? "sha256" : "sha1") : undefined;
    for (const [label, oid] of [["commit", codeReq.commit], ["blob", codeReq.blob]] as const) {
      if (oid === undefined || oid === null) continue;
      const oidCheck = validateQualifiedOid(oid);
      if (!oidCheck.ok) {
        return { ok: false, reason: `code-analysis ${label} OID rejected: ${oidCheck.errors.join("; ")}` };
      }
      if (expectedAlg !== undefined && oid.algorithm !== expectedAlg) {
        return { ok: false, reason: `code-analysis ${label} algorithm mismatch (${oid.algorithm} !== ${expectedAlg})` };
      }
    }

    const reasonAnchorFacts: ReasonAnchorFactDto[] = [];
    if (codeReq.reasonAnchors !== undefined) {
      if (!Array.isArray(codeReq.reasonAnchors)) {
        return { ok: false, reason: "code-analysis request.reasonAnchors must be an array" };
      }
      for (const pin of codeReq.reasonAnchors) {
        try {
          reasonAnchorFacts.push(toReasonAnchorFact(scope, pin));
        } catch (error) {
          return { ok: false, reason: `code-analysis reasonAnchor rejected: ${safePolicyReason(errorMessage(error))}` };
        }
      }
    }

    return {
      ok: true,
      prepared: {
        generationId,
        batchId,
        maxBatchBytes,
        expectedScope,
        ...(expectedIncarnation !== undefined ? { expectedIncarnation } : {}),
        fencingToken: clonedToken,
        policyVersion: isCommitted ? POLICY_VERSION : CONTENT_POLICY_VERSION,
        ...(codeReq.commit !== undefined ? { commit: cloneQualifiedOidOrNull(codeReq.commit) } : {}),
        ...(codeReq.blob !== undefined ? { blob: cloneQualifiedOidOrNull(codeReq.blob) } : {}),
        ...(clonedPathBytes !== undefined ? { pathBytes: clonedPathBytes } : {}),
        reasonAnchorFacts,
      },
    };
  }

  async function deliverPreparedCodeBatch(
    prepared: PreparedCodeDelivery,
    input: AnalyzeCodeInput,
    analysis: AnalyzeCodeOutcome,
    probe: GrammarProbe,
  ): Promise<{ readonly ok: true; readonly batches: readonly DeliveredBatchSummary[] } | { readonly ok: false; readonly reason: string }> {
    if (disabledRevocation !== null) {
      return { ok: false, reason: "producer declaration disabled/revoked" };
    }
    if (prepared.policyVersion === CONTENT_POLICY_VERSION) {
      if (
        !classifyPath(input.path).allowed ||
        containsSecretText(input.language) ||
        containsSecretText(input.path) ||
        containsSecretText(input.content)
      ) {
        return { ok: false, reason: `local code-analysis delivery refused by content policy (${CONTENT_POLICY_VERSION})` };
      }
      if (prepared.pathBytes !== undefined && !classifyPath(prepared.pathBytes).allowed) {
        return { ok: false, reason: `local code-analysis delivery refused by content policy (${CONTENT_POLICY_VERSION})` };
      }
      const derivedPolicyViolation = screenLocalAnalysisOutputs(analysis);
      if (derivedPolicyViolation !== null) {
        return { ok: false, reason: derivedPolicyViolation };
      }
    }

    const clockCheck = readValidClockNowMs();
    if (!clockCheck.ok) return clockCheck;
    const checkedAt = clockCheck.nowMs;

    let built: ReturnType<typeof buildFactBatch>;
    try {
      const grammarEvidence = probe.state === "available"
        ? { version: probe.version, digest: probe.bytesSha256, grammarId: `tree-sitter-${probe.language}` }
        : { version: null };
      const codeFact: CodeAnalysisFactDto = toCodeAnalysisFact(input, analysis, grammarEvidence, {
        ...(prepared.commit !== undefined ? { commit: prepared.commit } : {}),
        ...(prepared.blob !== undefined ? { blob: prepared.blob } : {}),
        ...(prepared.pathBytes !== undefined ? { pathBytes: prepared.pathBytes } : {}),
        policyVersion: prepared.policyVersion,
      });

      const rawReason = analysis.coverage.reason && !containsSecretText(analysis.coverage.reason)
        ? analysis.coverage.reason
        : `code-analysis ${analysis.state}`;
      const coverageFact: CoverageFactDto = {
        kind: "coverage",
        schemaVersion: FACT_SCHEMA_VERSION,
        axis: "ast",
        state: analysis.coverage.state,
        reason: rawReason,
        checkedAt,
        pendingCount: analysis.state === "complete" ? 0 : 1,
        pendingFrontier: null,
        lastSuccessAt: analysis.state === "complete" ? checkedAt : null,
      };

      const facts: LiveFactDto[] = [codeFact, ...prepared.reasonAnchorFacts, coverageFact];
      for (const fact of facts) {
        const check = validateLiveFact(fact);
        if (!check.ok) {
          return { ok: false, reason: `code-analysis fact validation failed: ${check.errors.join("; ")}` };
        }
      }

      built = buildFactBatch(
        {
          scope: prepared.expectedScope,
          producerName: PRODUCER_NAME,
          contractVersion: CONTRACT_VERSION,
          policyVersion: prepared.policyVersion,
          generationId: prepared.generationId,
          batchId: prepared.batchId,
          facts,
        },
        { maxBytes: prepared.maxBatchBytes },
      );
    } catch (error) {
      return { ok: false, reason: `code-analysis batch preparation refused: ${safePolicyReason(errorMessage(error))}` };
    }

    if (disabledRevocation !== null) {
      return { ok: false, reason: "producer declaration disabled/revoked before code-analysis batch delivery" };
    }
    const deliverClock = readValidClockNowMs();
    if (!deliverClock.ok) return deliverClock;
    const recheck = validateScopeFencingToken(
      prepared.fencingToken,
      prepared.expectedScope,
      prepared.expectedIncarnation,
      deliverClock.nowMs,
    );
    if (!recheck.ok) {
      return { ok: false, reason: `code-analysis fencing token expired or revoked before delivery: ${recheck.errors.join("; ")}` };
    }
    if (prepared.fencingToken.declarationRevision !== declaration.declarationRevision) {
      return { ok: false, reason: "code-analysis fencing token declarationRevision mismatch before delivery" };
    }
    let receipt: FactSinkReceipt;
    try {
      receipt = await ports.factSink.deliver(built.batch, cloneScopeFencingToken(prepared.fencingToken));
    } catch (error) {
      return { ok: false, reason: `fact sink refused code-analysis batch ${built.batch.batchId}: ${safePolicyReason(errorMessage(error))}` };
    }
    if (!receipt || typeof receipt !== "object" || receipt.received !== true || receipt.batchId !== built.batch.batchId) {
      return { ok: false, reason: `fact sink returned invalid acknowledgement for batch ${built.batch.batchId}` };
    }
    return {
      ok: true,
      batches: [{
        batchId: built.batch.batchId,
        batchDigest: built.batch.batchDigest,
        byteLength: built.encoded.byteLength,
        factCount: built.batch.facts.length,
        receipt,
      }],
    };
  }

  async function runCapabilityImpl(capability: CapabilityId, request?: CapabilityRequest): Promise<CapabilityResult> {
    const status = describeCapabilities().find((entry) => entry.capability === capability);
    if (!status) {
      throw new Error(`unknown capability "${String(capability)}"; known capabilities: ${CAPABILITY_IDS.join(", ")}`);
    }
    if (disabledRevocation !== null) {
      return { ...status, state: "unavailable", delivered: false, reason: "producer declaration disabled/revoked" };
    }
    if (status.state === "unavailable") {
      return { ...status, state: "unavailable", delivered: false };
    }
    if (capability === "refs") {
      return runRefsCapability(status, historyContext, request);
    }
    if (capability === "history-dag") {
      return runHistoryDagCapability(status, historyContext, request);
    }
    if (capability === "github-pr") {
      return runGithubPrCapability(status, historyContext, request);
    }
    if (capability === "retention-requests") {
      return runRetentionRequestsCapability(status, historyContext, request);
    }
    if (capability === "index-snapshot") {
      return runIndexSnapshotCapability(status, localContext, request);
    }
    if (capability === "working-tree") {
      return runWorkingTreeCapability(status, localContext, request);
    }
    if (capability === "diffs") {
      return runDiffsCapability(status, localContext, request);
    }
    if (capability === "reconciliation") {
      return runReconciliationCapability(status, localContext, request, schedulingController);
    }
    if (capability === "publication") {
      return runPublicationCapability(status, localContext, request, schedulingController);
    }
    if (capability !== "code-analysis") {
      return { ...status, state: "unavailable", delivered: false };
    }
    let operation: CodeAnalysisRequest | undefined;
    if (request !== undefined) {
      const codeRequest = request as CodeAnalysisRequest;
      const input = codeRequest?.input;
      const prototype = input && typeof input === "object" ? Object.getPrototypeOf(input) : undefined;
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error("code-analysis input must be a plain object");
      }
      const pinned = structuredClone(input);
      const invalidDeliveryTreeOid =
        wantsCodeDelivery(codeRequest) &&
        pinned.treeOid !== null &&
        (typeof pinned.treeOid !== "string" || !HEX_OID.test(pinned.treeOid));
      const worktreeId = pinned.treeOid === null ? declaredWorktreeId : null;
      const requestedScope: LiveScope = pinned.scope;
      const scopeWorktree = requestedScope?.worktree;
      if (
        requestedScope?.tenant !== scope.tenant ||
        requestedScope.clone !== scope.clone ||
        (!invalidDeliveryTreeOid &&
          ((scopeWorktree != null && scopeWorktree !== worktreeId) ||
            (pinned.worktreeId != null && pinned.worktreeId !== worktreeId)))
      ) {
        throw new Error("code-analysis scope does not match the workspace declaration");
      }
      const analysisScope: LiveScope = worktreeId === null ? scope : { ...scope, worktree: worktreeId };
      operation = { ...codeRequest, input: { ...pinned, worktreeId, scope: analysisScope } };
    }

    let preparedDelivery: PreparedCodeDelivery | undefined;
    if (operation !== undefined && wantsCodeDelivery(operation)) {
      const check = validateCodeDelivery(operation);
      if (!check.ok) {
        return { ...status, capability: "code-analysis", state: "unavailable", delivered: false, reason: check.reason };
      }
      preparedDelivery = check.prepared;
    }

    let liveCapture: CaptureResult | undefined;
    if (operation?.capture !== undefined) {
      const captured = captureForLocalCodeAnalysis(localContext, operation.input, operation.capture);
      if (!captured.ok) {
        return { ...status, capability: "code-analysis", state: "unavailable", delivered: false, reason: captured.reason };
      }
      liveCapture = captured.capture;
      operation = {
        ...operation,
        input: {
          ...operation.input,
          verifiedCapture: captured.verifiedCapture ?? null,
        },
      };
    }

    const manifest = await loadManifest();
    if (disabledRevocation !== null) {
      return { ...status, capability: "code-analysis", state: "unavailable", delivered: false, reason: "producer declaration disabled/revoked" };
    }
    const probes = await Promise.all(ADVERTISED_LANGUAGES.map((language) => probeGrammar(language, manifest, true)));
    if (disabledRevocation !== null) {
      grammarHandles.clear();
      return { ...status, capability: "code-analysis", state: "unavailable", delivered: false, reason: "producer declaration disabled/revoked" };
    }
    const languages = probes.map(grammarCoverageFor);
    for (const coverage of languages) latestGrammarCoverage.set(coverage.language, coverage);
    const available: CodeAnalysisCapabilityResult = { ...status, capability: "code-analysis", state: "available", delivered: true, languages };
    if (!operation) return available;

    const { input, objects } = operation;
    const effectiveCache =
      operation.cache !== undefined
        ? operation.cache
        : ports.cache !== undefined &&
            typeof ports.cache.load === "function" &&
            typeof ports.cache.store === "function" &&
            typeof ports.cache.authorize === "function"
          ? ports.cache
          : undefined;
    const probe = probes.find(({ language }) => language === input.language)
      ?? await probeGrammar(input.language, manifest, true);
    latestGrammarCoverage.set(input.language, grammarCoverageFor(probe));
    let analysis: AnalyzeCodeOutcome;
    if (preparedDelivery !== undefined) {
      try {
        analysis = await analyzeCode(input, { extractor, grammar: grammarFor(probe), objects, cache: effectiveCache });
      } catch (error) {
        return {
          ...status,
          capability: "code-analysis",
          state: "unavailable",
          delivered: false,
          reason: `code-analysis execution failed: ${safePolicyReason(errorMessage(error))}`,
        };
      }
    } else {
      analysis = await analyzeCode(input, { extractor, grammar: grammarFor(probe), objects, cache: effectiveCache });
    }
    if (disabledRevocation !== null) {
      grammarHandles.clear();
      return { ...status, capability: "code-analysis", state: "unavailable", delivered: false, reason: "producer declaration disabled/revoked" };
    }

    if (preparedDelivery !== undefined) {
      const delivered = await deliverPreparedCodeBatch(preparedDelivery, input, analysis, probe);
      if (!delivered.ok) {
        return { ...status, capability: "code-analysis", state: "unavailable", delivered: false, reason: delivered.reason };
      }
      return {
        ...available,
        analysis,
        ...(liveCapture !== undefined ? { capture: liveCapture } : {}),
        generationId: preparedDelivery.generationId,
        batches: delivered.batches,
      };
    }

    return {
      ...available,
      analysis,
      ...(liveCapture !== undefined ? { capture: liveCapture } : {}),
    };
  }

  return {
    describeCapabilities,
    runCapability: runCapabilityImpl as LiveFactory["runCapability"],

    grammarCoverage(language: string): GrammarCoverageDto {
      return latestGrammarCoverage.get(language) ?? {
        axis: "ast",
        language,
        state: "unavailable",
        reason: `${GRAMMAR_UNAVAILABLE_REASON}: "${language}" has no verified packaged grammar in this session`,
      };
    },

    grammarCoverageReport(language: string): CoverageReport {
      const coverage = this.grammarCoverage(language);
      return {
        axis: coverage.axis,
        language,
        state: coverage.state,
        reason: coverage.reason,
        checkedAt: ports.clock.now(),
      };
    },

    async loadGrammar(language: string): Promise<GrammarLoadResult> {
      if (disabledRevocation !== null) {
        const unavailableResult: GrammarLoadResult = {
          language,
          state: "unavailable",
          reason: "producer declaration disabled/revoked",
        };
        latestGrammarCoverage.set(language, grammarCoverageFor(unavailableResult));
        return unavailableResult;
      }
      const probe = await probeGrammar(language, await loadManifest(), false);
      if (disabledRevocation !== null) {
        grammarHandles.clear();
        const unavailableResult: GrammarLoadResult = {
          language,
          state: "unavailable",
          reason: "producer declaration disabled/revoked",
        };
        latestGrammarCoverage.set(language, grammarCoverageFor(unavailableResult));
        return unavailableResult;
      }
      latestGrammarCoverage.set(language, grammarCoverageFor(probe));
      if (probe.state === "unavailable") return probe;
      return { language, state: "available", grammar: probe.grammar, bytesSha256: probe.bytesSha256 };
    },

    validateBatch(batch: unknown): ValidationResult {
      return validateFactBatch(batch);
    },

    async disable(disableRequest?: DisableProducerRequest): Promise<DisableProducerResult> {
      const revocation = disableRequest?.revocation ?? revokeLiveDeclaration(declaration, disableRequest?.reason ?? "policy-withdrawn");
      const revCheck = validateDeclarationRevocation(revocation);
      if (!revCheck.ok) {
        throw new Error(`invalid producer revocation: ${revCheck.errors.join("; ")}`);
      }
      if (
        revocation.declarationId !== declaration.declarationId ||
        revocation.tenant !== declaration.tenant ||
        revocation.cloneId !== declaration.cloneId ||
        revocation.worktreeId !== declaration.worktreeId ||
        revocation.declarationRevision !== declaration.declarationRevision
      ) {
        throw new Error("producer disable revocation does not match factory declaration");
      }
      if (disableRequest?.generationId !== undefined && !isStrictGenerationId(disableRequest.generationId)) {
        throw new Error('producer disable generationId must be a strict fixed-width generation id ("gen:" plus 10 digits)');
      }

      // Latch fence synchronously BEFORE awaiting shutdown or private purge so no
      // concurrent capability, grammar load, or sink delivery can slip past disable().
      disabledRevocation = revocation;
      grammarHandles.clear();

      if (ports.scheduling !== undefined) {
        const reconcileStatus = describeCapabilities().find((entry) => entry.capability === "reconciliation")!;
        const shutdownRes = await runReconciliationCapability(
          reconcileStatus,
          localContext,
          {
            generationId: disableRequest?.generationId ?? formatProducerGenerationId(9_999_999_999),
            action: "shutdown",
          },
          schedulingController,
        );
        if (shutdownRes.state !== "available" || shutdownRes.action !== "shutdown") {
          throw new Error(
            `producer disable scheduled shutdown failed: ${shutdownRes.state === "unavailable" ? shutdownRes.reason : "unexpected reconciliation action"}`,
          );
        }
      }

      const targetStore = disableRequest?.store ?? ports.content?.latestSnapshots;
      let purgeOutcome: UnregisterPurgeOutcome | null = null;
      if (targetStore !== undefined) {
        purgeOutcome = await runUnregisterPurge({ revocation, store: targetStore });
      }

      grammarHandles.clear();
      return {
        disabled: true,
        declarationId: declaration.declarationId,
        cloneId: declaration.cloneId,
        worktreeId: declaration.worktreeId,
        declarationRevision: declaration.declarationRevision,
        revocation,
        shutdownCompleted: true,
        purgeOutcome,
        preservedCommittedHistory: true,
      };
    },
  };
}

/** The advertised grammar matrix of this build, from the pinned manifest data. */
export const ADVERTISED_GRAMMAR_LANGUAGES: readonly string[] = ADVERTISED_LANGUAGES;

// The canonical identity derivation (L6a, spec §3/§12) is part of the public
// integration surface: h2a and cluster-mesh mint cloneId/worktreeId/
// declarationId through exactly these functions, so every seat derives
// byte-identical opaque ids from identical components. The minting needs
// node:crypto (sha256), which keeps it out of the data-pure /contracts
// entry; the derivation itself stays pure and deterministic over its
// arguments (see ./registration.js).
export {
  deriveCloneIdentity,
  deriveWorktreeIdentity,
  deriveDeclarationIdentity,
  createLiveDeclaration,
  reviseLiveDeclaration,
  revokeLiveDeclaration,
  isSameClone,
  classifyLifecycleEvent,
  type CreateLiveDeclarationInput,
  type LiveDeclarationPatch,
  type DeclarationIdentityDto,
  type DeriveCloneIdentityInput,
  type DeriveWorktreeIdentityInput,
  type DeriveDeclarationIdentityInput,
} from "./registration.js";
export {
  runUnregisterPurge,
  type UnregisterPurgeInput,
  type UnregisterPurgeOutcome,
} from "./snapshots.js";
