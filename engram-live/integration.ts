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
  GRAMMAR_UNAVAILABLE_REASON,
  describeCapabilities,
  type CapabilityId,
  type CapabilityStatus,
  type CoverageReport,
  type FactSinkPort,
  type GrammarCoverageDto,
  type HistoryPersistencePort,
  type LiveScope,
  type ScopeFencingTokenDto,
  type ValidationResult,
  type WorkspaceDeclarationDto,
  validateFactBatch,
  validateWorkspaceDeclaration,
} from "./contracts.js";
import {
  analyzeCode,
  type AnalyzeCodeInput,
  type AnalyzeCodeOutcome,
  type CodeAnalysisPorts,
  type GrammarStatusPort,
  type VerifiedCaptureEvidenceDto,
} from "./code-analysis.js";
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
    const cached = grammarHandles.get(language);
    if (cached?.digest === digest) return cached.handle;
    runtimeInit ??= Promise.resolve().then(() => runtime.init?.()).catch((error: unknown) => {
      runtimeInit = undefined;
      throw error;
    });
    const handle = runtimeInit.then(async () => {
      const grammar = await runtime.loadLanguage(Uint8Array.from(bytes));
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

  async function runCapabilityImpl(capability: CapabilityId, request?: CapabilityRequest): Promise<CapabilityResult> {
    const status = describeCapabilities().find((entry) => entry.capability === capability);
    if (!status) {
      throw new Error(`unknown capability "${String(capability)}"; known capabilities: ${CAPABILITY_IDS.join(", ")}`);
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
      const worktreeId = pinned.treeOid === null ? declaredWorktreeId : null;
      const requestedScope: LiveScope = pinned.scope;
      const scopeWorktree = requestedScope?.worktree;
      if (requestedScope?.tenant !== scope.tenant || requestedScope.clone !== scope.clone
        || (scopeWorktree != null && scopeWorktree !== worktreeId)
        || (pinned.worktreeId != null && pinned.worktreeId !== worktreeId)) {
        throw new Error("code-analysis scope does not match the workspace declaration");
      }
      const analysisScope: LiveScope = worktreeId === null ? scope : { ...scope, worktree: worktreeId };
      operation = { ...codeRequest, input: { ...pinned, worktreeId, scope: analysisScope } };
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
    const probes = await Promise.all(ADVERTISED_LANGUAGES.map((language) => probeGrammar(language, manifest, true)));
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
    const analysis = await analyzeCode(input, { extractor, grammar: grammarFor(probe), objects, cache: effectiveCache });
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
      const probe = await probeGrammar(language, await loadManifest(), false);
      latestGrammarCoverage.set(language, grammarCoverageFor(probe));
      if (probe.state === "unavailable") return probe;
      return { language, state: "available", grammar: probe.grammar, bytesSha256: probe.bytesSha256 };
    },

    validateBatch(batch: unknown): ValidationResult {
      return validateFactBatch(batch);
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
  type DeclarationIdentityDto,
  type DeriveCloneIdentityInput,
  type DeriveWorktreeIdentityInput,
  type DeriveDeclarationIdentityInput,
} from "./registration.js";
