// @sentropic/engram-live/factory-history — E-ASM2 committed-history capability
// composition behind the neutral factory
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3–7, 11; plan/09 E-ASM2).
//
// Wires the four committed-history capabilities (`refs`, `history-dag`,
// `github-pr`, `retention-requests`) to their delivered neutral engines
// (`./refs.js`, `./history.js`, `./pr-sync.js` + `./pr-attribution.js`,
// `./retention.js`), builds L3a-E1 canonical typed batches, enforces L3a-E2
// clone-scoped fencing tokens and delivers every batch through the single
// L5-P-m8 `FactSinkPort`.
//
// Strict invariants:
//   - Never composes a Git executor without a host-injected, validated empty
//     hooks-isolation directory outside every observed source root and outside
//     the OS temporary directory default. Never calls `mkdtempSync`, `mkdirSync`
//     or `writeFileSync` — creates nothing under `tmpdir()` or any worktree.
//   - Never reports a capability `"available"` without executing its engine
//     and receiving verified sink acknowledgements.
//   - Missing or refusing ports, omitted requests or invalid/expired/mismatched
//     fencing tokens produce an explicit `"unavailable"` result (`delivered:
//     false`) with a non-empty reason and zero sink writes.
//   - Neutral closure only: no root package, no host, no database, no network,
//     no `node:module` or loader factory.

import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import {
  CONTRACT_VERSION,
  FACT_SCHEMA_VERSION,
  MAX_FACT_BATCH_BYTES,
  POLICY_VERSION,
  PRODUCER_NAME,
  isStrictGenerationId,
  validateGithubRepository,
  validatePrAttribution,
  validateRawRefObservation,
  validateRetentionReceipt,
  validateScopeFencingToken,
  type CapabilityStatus,
  type CoverageFactDto,
  type FactSinkPort,
  type FactSinkReceipt,
  type GithubRepositoryDto,
  type HistoryCheckpointDto,
  type HistoryCommitFactDto,
  type HistoryPersistencePort,
  type LiveFactDto,
  type LiveScope,
  type OidAlgorithm,
  type PrAttributionDto,
  type PrObjectJobDto,
  type RawRefObservationDto,
  type RetainedRootDto,
  type RetentionReceiptDto,
  type ScopeFencingTokenDto,
  type SelectedRootDto,
  type TrackedRefDto,
  type ValidationResult,
  type WorkspaceDeclarationDto,
  type WorktreeHead,
} from "./contracts.js";
import {
  BatchCodecError,
  buildFactBatch,
  canonicalEncodeValue,
} from "./batch-codec.js";
import {
  toCommitAndChangedFileFacts,
  toHistoryCheckpointProgressFact,
  toPrAttributionFact,
  toPrCursorProgressFact,
  toPrObjectJobProgressFact,
  toPullRequestObservationFact,
  toRefObservationFact,
  toRetainedRootProgressFact,
  toRetentionReceiptFact,
  toTrackedRefFact,
} from "./facts.js";
import {
  createSafeGitExecutor,
  type GitSpawnFn,
  type SafeGitExecutor,
} from "./git-executor.js";
import type { GitProcessPort } from "./git-stream.js";
import {
  runHistoryPass,
  type HistoryPassOutcome,
} from "./history.js";
import {
  pinPrAttribution,
  type PinPrAttributionInput,
} from "./pr-attribution.js";
import {
  objectJobIdentityKey,
  runPrSyncPass,
  type GithubPrTransportPort,
  type PrSyncOutcome,
  type PrSyncPersistencePort,
} from "./pr-sync.js";
import {
  classifyRefName,
  selectHistoryRoots,
  trackRef,
  type WorktreeHeadRef,
} from "./refs.js";
import type { RepositoryObservationDto } from "./repository.js";
import {
  runRetentionPass,
  type RetentionPassOutcome,
  type RetentionPort,
} from "./retention.js";

/**
 * Typed Git capability supplied by the host (spec §7; plan/09 E-ASM2).
 * Replaces the L1b placeholder seam with the exact capabilities consumed by
 * `SafeGitExecutor` (refs, worktree capture, attribution) and `GitProcessPort`
 * (L2a/L2b streaming history). The host MUST supply an explicit
 * `disabledHooksDir` outside observed worktrees and never defaulted to the OS
 * temporary directory; the factory never creates a temporary hooks directory.
 */
export interface GitPort {
  /** Resolved path to the host-approved Git executable. */
  readonly gitPath: string;
  /** Mandatory host-injected empty hooks-isolation directory. */
  readonly disabledHooksDir: string;
  /** Streaming Git process port consumed by git-stream and history-dag. */
  readonly process?: GitProcessPort;
  /** Optional custom synchronous spawn launcher used when composing SafeGitExecutor. */
  readonly spawn?: GitSpawnFn;
  /** Optional host-controlled base environment merged before SafeGitExecutor hardening. */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Optional pre-composed SafeGitExecutor. When supplied, its `gitPath` and
   * `disabledHooksDir` must equal the validated host-injected values.
   */
  readonly executor?: SafeGitExecutor;
}

export interface CommittedBatchContext {
  /** Producer generation correlation ID (`gen:<10 digits>`, L3a-E2). */
  readonly generationId: string;
  /** Clone-scoped fencing token validated against declaration scope, revision and clock. */
  readonly fencingToken: ScopeFencingTokenDto;
  /** Optional storage-owned incarnation expected on the fencing token. */
  readonly expectedIncarnation?: string;
  /** Optional per-batch byte ceiling (must stay <= MAX_FACT_BATCH_BYTES = 4 MiB). */
  readonly maxBatchBytes?: number;
}

export interface DeliveredBatchSummary {
  readonly batchId: string;
  readonly batchDigest: string;
  readonly byteLength: number;
  readonly factCount: number;
  readonly receipt: FactSinkReceipt;
}

export interface RefsCapabilityRequest extends CommittedBatchContext {
  /** Authorized repository/worktree path to observe refs from through SafeGitExecutor. */
  readonly cwd: string;
  /** Full ref name of the default branch (e.g. "refs/heads/main"); selected even when old. */
  readonly defaultBranch: string;
  /** Optional prior raw ref observations folded with the fresh observation round. */
  readonly priorObservations?: readonly RawRefObservationDto[];
  /**
   * Optional registered worktree heads for root selection. When omitted, the
   * factory resolves the current worktree HEAD under `declaration.worktreeId`.
   */
  readonly worktreeHeads?: readonly WorktreeHeadRef[];
  /** Optional previously ingested retained roots included in root selection. */
  readonly retainedRoots?: readonly RetainedRootDto[];
  /** Optional additional absolute config paths to gate alongside the repository's resolved configs (strictly additive). */
  readonly configPaths?: readonly string[];
}

export interface HistoryDagCapabilityRequest extends CommittedBatchContext {
  /** Authorized repository/worktree path to stream committed history from. */
  readonly cwd: string;
  /** Observed repository identity (must match `declaration.cloneId`). */
  readonly repository: RepositoryObservationDto;
  /** Full ref name of the default branch; selected even when old. */
  readonly defaultBranch: string;
  /** Optional raw ref observations; when omitted, live refs are observed via SafeGitExecutor. */
  readonly refObservations?: readonly RawRefObservationDto[];
  /** Optional additional absolute config paths to gate alongside the repository's resolved configs (strictly additive). */
  readonly configPaths?: readonly string[];
  /** Optional per-request HistoryPersistencePort (defaults to `ports.historyPersistence`). */
  readonly persistence?: HistoryPersistencePort;
}

export interface GithubPrCapabilityRequest extends CommittedBatchContext {
  /** GitHub owner/repo identity (no URL, no credential/token). */
  readonly repository: GithubRepositoryDto;
  /** Incremental (with overlap window) or full sweep. */
  readonly sweepKind: "incremental" | "full";
  /** Optional per-PR merge-base evidence pinned through `pinPrAttribution`. */
  readonly attributions?: readonly PinPrAttributionInput[];
  /** Optional per-request PrSyncPersistencePort (defaults to `ports.prPersistence`). */
  readonly persistence?: PrSyncPersistencePort;
}

export interface RetentionRequestsCapabilityRequest extends CommittedBatchContext {
  /** Selected history roots requiring private object retention. */
  readonly roots: readonly SelectedRootDto[];
  /** Optional per-request RetentionPort (defaults to `ports.retention`). */
  readonly retention?: RetentionPort;
}

export interface UnavailableCapabilityResult extends CapabilityStatus {
  readonly state: "unavailable";
  readonly delivered: false;
}

export interface RefsCapabilityResult extends CapabilityStatus {
  readonly capability: "refs";
  readonly state: "available";
  readonly delivered: true;
  readonly generationId: string;
  readonly oidAlgorithm: OidAlgorithm;
  readonly observations: readonly RawRefObservationDto[];
  readonly trackedRefs: readonly TrackedRefDto[];
  readonly roots: readonly SelectedRootDto[];
  readonly batches: readonly DeliveredBatchSummary[];
}

export interface HistoryDagCapabilityResult extends CapabilityStatus {
  readonly capability: "history-dag";
  readonly state: "available";
  readonly delivered: true;
  readonly generationId: string;
  readonly outcome: HistoryPassOutcome;
  readonly batches: readonly DeliveredBatchSummary[];
}

export interface GithubPrCapabilityResult extends CapabilityStatus {
  readonly capability: "github-pr";
  readonly state: "available";
  readonly delivered: true;
  readonly generationId: string;
  readonly outcome: PrSyncOutcome;
  readonly attributions: readonly PrAttributionDto[];
  readonly objectJobs: readonly PrObjectJobDto[];
  readonly batches: readonly DeliveredBatchSummary[];
}

export interface RetentionRequestsCapabilityResult extends CapabilityStatus {
  readonly capability: "retention-requests";
  readonly state: "available";
  readonly delivered: true;
  readonly generationId: string;
  readonly outcome: RetentionPassOutcome;
  readonly receipts: readonly RetentionReceiptDto[];
  readonly batches: readonly DeliveredBatchSummary[];
}

export type CommittedHistoryCapabilityResult =
  | UnavailableCapabilityResult
  | RefsCapabilityResult
  | HistoryDagCapabilityResult
  | GithubPrCapabilityResult
  | RetentionRequestsCapabilityResult;

export interface CommittedHistoryRuntimeContext {
  readonly declaration: WorkspaceDeclarationDto;
  readonly clock: { now(): number } | undefined;
  readonly git: GitPort | undefined;
  readonly factSink: FactSinkPort | undefined;
  readonly historyPersistence: HistoryPersistencePort | undefined;
  readonly githubPr: GithubPrTransportPort | undefined;
  readonly prPersistence: PrSyncPersistencePort | undefined;
  readonly retention: RetentionPort | undefined;
}

export interface ValidateHooksIsolationOptions {
  readonly authorizedRoots: readonly string[];
  readonly observedPaths?: readonly string[];
  /** Default true: verifies the injected path exists on disk as a real empty non-symlink directory. */
  readonly requireExistingEmptyDir?: boolean;
}

export type ComposeGitExecutorOutcome =
  | { readonly ok: true; readonly executor: SafeGitExecutor; readonly disabledHooksDir: string }
  | { readonly ok: false; readonly reason: string };

interface LocalConfigResolution {
  readonly gitDir: string | null;
  readonly commonDir: string | null;
  readonly paths: readonly string[];
  readonly monitoredPaths: readonly string[];
}

interface RepositoryConfigGate {
  readonly rootReal: string;
  readonly realGitDir: string;
  readonly realCommonDir: string;
  readonly configPaths: readonly string[];
  readonly monitoredPaths: readonly string[];
  readonly extraConfigPaths: readonly string[];
  readonly fingerprint: string;
}

type StagedHistoryWrite =
  | { readonly kind: "retained-root"; readonly value: RetainedRootDto }
  | { readonly kind: "commit-fact"; readonly value: HistoryCommitFactDto }
  | { readonly kind: "completion"; readonly value: HistoryCheckpointDto };

const FALLBACK_HOOKS_PREFIX = "engram-live-no-hooks-";
const ENVELOPE_HEADROOM_BYTES = 1024;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || value instanceof Uint8Array) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unavailable(status: CapabilityStatus, reason: string): UnavailableCapabilityResult {
  return {
    capability: status.capability,
    state: "unavailable",
    reason,
    plannedLot: status.plannedLot,
    delivered: false,
  };
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

/**
 * Validate a host-injected hooks-isolation directory before composing any Git
 * executor (LIVE §2, §7; plan/09 E-ASM2 RED 3 & Forbidden).
 *
 * Refuses missing/empty/relative paths, bare OS tmpdir, the unsafe fallback
 * prefix `engram-live-no-hooks-*`, any path inside an observed source root or
 * git-dir, symlinks, non-existent directories and non-empty directories.
 */
export function validateHostHooksIsolationDir(
  disabledHooksDir: unknown,
  options: ValidateHooksIsolationOptions,
): ValidationResult {
  const errors: string[] = [];
  if (
    typeof disabledHooksDir !== "string" ||
    disabledHooksDir.length === 0 ||
    disabledHooksDir.trim().length === 0 ||
    disabledHooksDir !== disabledHooksDir.trim() ||
    disabledHooksDir.includes("\0")
  ) {
    return {
      ok: false,
      errors: ["host-injected hooks-isolation directory (disabledHooksDir) must be a non-empty NUL-free path"],
    };
  }
  if (!isAbsolute(disabledHooksDir)) {
    return {
      ok: false,
      errors: ["host-injected hooks-isolation directory (disabledHooksDir) must be an absolute path"],
    };
  }
  const normalized = normalizePath(disabledHooksDir);
  const osTmpNormalized = normalizePath(tmpdir());
  const osTmpReal = tryRealpath(osTmpNormalized);
  if (normalized === "/") {
    errors.push("hooks-isolation directory (disabledHooksDir) cannot be the filesystem root");
  }
  if (normalized === osTmpNormalized || (osTmpReal !== null && normalized === normalizePath(osTmpReal))) {
    errors.push("hooks-isolation directory (disabledHooksDir) cannot default to the OS temporary directory");
  }
  if (basename(normalized).startsWith(FALLBACK_HOOKS_PREFIX)) {
    errors.push("hooks-isolation directory (disabledHooksDir) cannot use an engram-live-no-hooks-* temporary fallback");
  }

  const forbiddenParents: string[] = [...options.authorizedRoots, ...(options.observedPaths ?? [])];
  for (const parent of forbiddenParents) {
    if (typeof parent !== "string" || parent.length === 0 || !isAbsolute(parent)) continue;
    if (isInsideOrEqual(normalized, parent)) {
      errors.push("hooks-isolation directory (disabledHooksDir) must reside outside every observed source root and git-dir");
      break;
    }
  }

  if (options.requireExistingEmptyDir !== false) {
    let lstat;
    try {
      lstat = lstatSync(normalized);
    } catch {
      errors.push("hooks-isolation directory (disabledHooksDir) must exist as a host-managed directory");
      return { ok: false, errors };
    }
    if (lstat.isSymbolicLink() || !lstat.isDirectory()) {
      errors.push("hooks-isolation directory (disabledHooksDir) must be a real non-symlink directory");
      return { ok: false, errors };
    }
    const realHooks = tryRealpath(normalized);
    if (realHooks !== null) {
      const realHooksNorm = normalizePath(realHooks);
      if (realHooksNorm === osTmpNormalized || (osTmpReal !== null && realHooksNorm === normalizePath(osTmpReal))) {
        errors.push("hooks-isolation directory (disabledHooksDir) realpath cannot resolve to the OS temporary directory");
      }
      for (const parent of forbiddenParents) {
        const realParent = typeof parent === "string" && parent.length > 0 ? tryRealpath(parent) : null;
        if (realParent !== null && isInsideOrEqual(realHooksNorm, realParent)) {
          errors.push("hooks-isolation directory (disabledHooksDir) realpath must reside outside every observed source root and git-dir");
          break;
        }
      }
    }
    let entries: string[];
    try {
      entries = readdirSync(normalized);
    } catch {
      errors.push("hooks-isolation directory (disabledHooksDir) must be readable");
      return { ok: false, errors };
    }
    if (entries.length > 0) {
      errors.push("hooks-isolation directory (disabledHooksDir) must be empty");
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Compose a `SafeGitExecutor` from a host-injected `GitPort` ONLY after
 * proving that `gitPath` and a host-injected `disabledHooksDir` are valid.
 * Never triggers `createSafeGitExecutor`'s OS-tmpdir fallback.
 */
export function composeFactoryGitExecutor(
  git: unknown,
  options: ValidateHooksIsolationOptions,
): ComposeGitExecutorOutcome {
  if (!git || typeof git !== "object" || Array.isArray(git) || git instanceof Uint8Array) {
    return { ok: false, reason: "missing host Git port (ports.git)" };
  }
  const candidate = git as Partial<GitPort>;
  if (
    typeof candidate.gitPath !== "string" ||
    candidate.gitPath.length === 0 ||
    candidate.gitPath.trim().length === 0 ||
    candidate.gitPath.includes("\0")
  ) {
    return { ok: false, reason: "host Git port (ports.git.gitPath) requires a resolved Git executable path" };
  }
  const hooksCheck = validateHostHooksIsolationDir(candidate.disabledHooksDir, options);
  if (!hooksCheck.ok) {
    return {
      ok: false,
      reason: `refused Git executor composition without valid host-injected hooks-isolation directory: ${hooksCheck.errors.join("; ")}`,
    };
  }
  const disabledHooksDir = normalizePath(candidate.disabledHooksDir as string);
  if (candidate.executor !== undefined) {
    const exec = candidate.executor as Partial<SafeGitExecutor>;
    if (
      typeof exec.probe !== "function" ||
      typeof exec.run !== "function" ||
      typeof exec.blame !== "function" ||
      typeof exec.assertNoConfigIncludes !== "function" ||
      typeof exec.probeNoConfigIncludes !== "function" ||
      exec.gitPath !== candidate.gitPath ||
      typeof exec.disabledHooksDir !== "string" ||
      normalizePath(exec.disabledHooksDir) !== disabledHooksDir
    ) {
      return {
        ok: false,
        reason: "pre-composed Git executor does not match the validated host gitPath and hooks-isolation directory",
      };
    }
    return { ok: true, executor: candidate.executor, disabledHooksDir };
  }
  if (candidate.spawn !== undefined && typeof candidate.spawn !== "function") {
    return { ok: false, reason: "host Git port spawn override must be a function when supplied" };
  }
  try {
    const executor = createSafeGitExecutor({
      gitPath: candidate.gitPath,
      disabledHooksDir,
      ...(candidate.spawn !== undefined ? { spawn: candidate.spawn } : {}),
      ...(candidate.env !== undefined ? { env: candidate.env } : {}),
    });
    return { ok: true, executor, disabledHooksDir };
  } catch (error) {
    return { ok: false, reason: `failed to compose Git executor: ${errorDetail(error)}` };
  }
}

function readClockMs(clock: { now(): number } | undefined): { ok: true; nowMs: number } | { ok: false; reason: string } {
  if (!clock || typeof clock.now !== "function") {
    return { ok: false, reason: "missing host clock port (ports.clock.now)" };
  }
  let value: number;
  try {
    value = clock.now();
  } catch (error) {
    return { ok: false, reason: `host clock port refused: ${errorDetail(error)}` };
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return { ok: false, reason: "host clock port must return a positive safe-integer Unix millisecond timestamp" };
  }
  return { ok: true, nowMs: value };
}

function validateFactSinkPort(sink: FactSinkPort | undefined): { ok: true; sink: FactSinkPort } | { ok: false; reason: string } {
  if (!sink || typeof sink.deliver !== "function") {
    return { ok: false, reason: "missing host fact sink port (ports.factSink.deliver)" };
  }
  return { ok: true, sink };
}

function validateCommittedFencingToken(
  token: unknown,
  declaration: WorkspaceDeclarationDto,
  nowMs: number,
  expectedIncarnation?: string,
): { ok: true; token: ScopeFencingTokenDto } | { ok: false; reason: string } {
  const cloneScope: LiveScope = { tenant: declaration.tenant, clone: declaration.cloneId };
  const checked = validateScopeFencingToken(token, cloneScope, expectedIncarnation, nowMs);
  if (!checked.ok) {
    return { ok: false, reason: `fencing token rejected: ${checked.errors.join("; ")}` };
  }
  const typed = token as ScopeFencingTokenDto;
  if (typed.scope.worktree !== undefined) {
    return { ok: false, reason: "committed-history fencing token must be clone-scoped (scope.worktree must be absent)" };
  }
  if (typed.declarationRevision !== declaration.declarationRevision) {
    return {
      ok: false,
      reason: `fencing token declarationRevision (${typed.declarationRevision}) does not match workspace declaration revision (${declaration.declarationRevision})`,
    };
  }
  const cloned: ScopeFencingTokenDto = {
    tokenId: typed.tokenId,
    scope: { tenant: typed.scope.tenant, clone: typed.scope.clone },
    epoch: typed.epoch,
    epochId: typed.epochId,
    declarationRevision: typed.declarationRevision,
    projectionIncarnation: typed.projectionIncarnation,
    issuedAt: typed.issuedAt,
    expiresAt: typed.expiresAt,
  };
  return { ok: true, token: cloned };
}

function validateBatchContext(
  request: Record<string, unknown>,
  declaration: WorkspaceDeclarationDto,
  nowMs: number,
):
  | {
      readonly ok: true;
      readonly generationId: string;
      readonly fencingToken: ScopeFencingTokenDto;
      readonly expectedIncarnation?: string;
      readonly maxBatchBytes: number;
    }
  | { readonly ok: false; readonly reason: string } {
  const generationId = request.generationId;
  if (!isStrictGenerationId(generationId)) {
    return { ok: false, reason: 'request.generationId must be a strict fixed-width generation id ("gen:" plus 10 digits)' };
  }
  const expectedIncarnation = request.expectedIncarnation;
  if (expectedIncarnation !== undefined && (typeof expectedIncarnation !== "string" || expectedIncarnation.length === 0)) {
    return { ok: false, reason: "request.expectedIncarnation, when present, must be a non-empty string" };
  }
  const maxBatchBytes = request.maxBatchBytes ?? MAX_FACT_BATCH_BYTES;
  if (
    typeof maxBatchBytes !== "number" ||
    !Number.isSafeInteger(maxBatchBytes) ||
    maxBatchBytes <= 0 ||
    maxBatchBytes > MAX_FACT_BATCH_BYTES
  ) {
    return { ok: false, reason: `request.maxBatchBytes must be a positive safe integer <= ${MAX_FACT_BATCH_BYTES}` };
  }
  const tokenCheck = validateCommittedFencingToken(request.fencingToken, declaration, nowMs, expectedIncarnation);
  if (!tokenCheck.ok) return tokenCheck;
  return {
    ok: true,
    generationId,
    fencingToken: tokenCheck.token,
    ...(expectedIncarnation !== undefined ? { expectedIncarnation } : {}),
    maxBatchBytes,
  };
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function dedupePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const entry of paths) {
    const normalized = normalizePath(entry);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

function assertRegularConfigPaths(
  requiredPaths: readonly string[],
  monitoredPaths: readonly string[],
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const requiredSet = new Set(requiredPaths);
  for (const path of dedupePaths([...requiredPaths, ...monitoredPaths])) {
    let st;
    try {
      st = lstatSync(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!requiredSet.has(path) && (code === "ENOENT" || code === "ENOTDIR")) {
        continue;
      }
      return { ok: false, reason: `repository configuration path is missing or unreadable: ${path}` };
    }
    if (st.isSymbolicLink()) {
      return { ok: false, reason: `refusing symbolic link in repository configuration path: ${path}` };
    }
    if (!st.isFile()) {
      return { ok: false, reason: `refusing non-regular repository configuration path: ${path}` };
    }
  }
  return { ok: true };
}

function fingerprintConfigPaths(paths: readonly string[]): string {
  const digest = createHash("sha256");
  for (const path of paths) {
    digest.update(path);
    digest.update("\0");
    try {
      const st = lstatSync(path, { bigint: true });
      if (st.isFile()) {
        const bytes = readFileSync(path);
        const contentSha = createHash("sha256").update(bytes).digest("hex");
        digest.update(
          `file\0mode=${String(st.mode)}\0size=${String(st.size)}\0dev=${String(st.dev)}\0` +
            `ino=${String(st.ino)}\0mtimeNs=${String(st.mtimeNs)}\0ctimeNs=${String(st.ctimeNs)}\0` +
            `sha256=${contentSha}\0`,
        );
      } else if (st.isSymbolicLink()) {
        const linkTarget = readlinkSync(path);
        digest.update(
          `symlink\0mode=${String(st.mode)}\0size=${String(st.size)}\0dev=${String(st.dev)}\0` +
            `ino=${String(st.ino)}\0mtimeNs=${String(st.mtimeNs)}\0ctimeNs=${String(st.ctimeNs)}\0` +
            `target=${linkTarget}\0`,
        );
        try {
          const realTarget = realpathSync(path);
          const targetStat = statSync(path, { bigint: true });
          digest.update(
            `realpath=${realTarget}\0tmode=${String(targetStat.mode)}\0tsize=${String(targetStat.size)}\0` +
              `tdev=${String(targetStat.dev)}\0tino=${String(targetStat.ino)}\0` +
              `tmtimeNs=${String(targetStat.mtimeNs)}\0tctimeNs=${String(targetStat.ctimeNs)}\0`,
          );
          if (targetStat.isFile()) {
            const bytes = readFileSync(path);
            const contentSha = createHash("sha256").update(bytes).digest("hex");
            digest.update(`tsha256=${contentSha}\0`);
          } else {
            digest.update("target-non-regular\0");
          }
        } catch (targetError) {
          const targetCode = (targetError as NodeJS.ErrnoException).code;
          digest.update(targetCode === "ENOENT" || targetCode === "ENOTDIR" ? "dangling\0" : "target-unreadable\0");
        }
      } else {
        digest.update(
          `non-regular\0mode=${String(st.mode)}\0size=${String(st.size)}\0dev=${String(st.dev)}\0` +
            `ino=${String(st.ino)}\0mtimeNs=${String(st.mtimeNs)}\0ctimeNs=${String(st.ctimeNs)}\0`,
        );
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      digest.update(code === "ENOENT" || code === "ENOTDIR" ? "absent\0" : "unreadable\0");
    }
  }
  return digest.digest("hex");
}

function resolveLocalConfig(rootReal: string): LocalConfigResolution {
  let gitDir: string | null = null;
  try {
    const dotGit = join(rootReal, ".git");
    const stat = statSync(dotGit);
    if (stat.isDirectory()) {
      gitDir = dotGit;
    } else if (stat.isFile()) {
      const raw = readFileSync(dotGit, "utf8").trim();
      if (raw.startsWith("gitdir:")) {
        const target = raw.slice("gitdir:".length).trim();
        gitDir = isAbsolute(target) ? target : resolve(rootReal, target);
      }
    }
  } catch {
    // Fall through to bare-repository check below.
  }
  if (gitDir === null) {
    if (pathEntryExists(join(rootReal, "HEAD")) && pathEntryExists(join(rootReal, "config"))) {
      gitDir = rootReal;
    } else {
      return { gitDir: null, commonDir: null, paths: [], monitoredPaths: [] };
    }
  }
  let commonDir = gitDir;
  try {
    const raw = readFileSync(join(gitDir, "commondir"), "utf8").trim();
    if (raw) commonDir = isAbsolute(raw) ? raw : resolve(gitDir, raw);
  } catch {
    // Primary or bare repository: gitDir is commonDir.
  }
  // Always gate the common repository config (fail-closed if missing/unreadable)
  // plus any present per-worktree/local config files; monitor all candidate slots
  // so mid-round creation, deletion, or tamper is detected by fingerprinting.
  const commonConfig = join(commonDir, "config");
  const worktreeConfig = join(gitDir, "config.worktree");
  const localGitConfig = join(gitDir, "config");
  const paths: string[] = [commonConfig];
  const monitoredPaths: string[] = [commonConfig, worktreeConfig];
  if (pathEntryExists(worktreeConfig)) paths.push(worktreeConfig);
  if (normalizePath(gitDir) !== normalizePath(commonDir)) {
    monitoredPaths.push(localGitConfig);
    if (pathEntryExists(localGitConfig)) paths.push(localGitConfig);
  }
  return {
    gitDir,
    commonDir,
    paths: dedupePaths(paths),
    monitoredPaths: dedupePaths(monitoredPaths),
  };
}

function authorizeAndResolveRepo(
  cwd: unknown,
  authorizedRoots: readonly string[],
  explicitConfigPaths?: readonly string[],
):
  | {
      readonly ok: true;
      readonly rootReal: string;
      readonly localConfig: LocalConfigResolution;
      readonly extraConfigPaths: readonly string[];
    }
  | { readonly ok: false; readonly reason: string } {
  if (typeof cwd !== "string" || cwd.length === 0 || cwd.includes("\0") || !isAbsolute(cwd)) {
    return { ok: false, reason: "request.cwd must be a non-empty NUL-free absolute path" };
  }
  const rootReal = tryRealpath(cwd);
  if (rootReal === null) {
    return { ok: false, reason: `repository path cannot be resolved on disk: ${cwd}` };
  }
  const authorizedReal = authorizedRoots
    .map((entry) => tryRealpath(entry))
    .filter((entry): entry is string => entry !== null);
  const authorized = authorizedReal.some((entry) => isInsideOrEqual(rootReal, entry));
  if (!authorized) {
    return { ok: false, reason: `repository path is outside workspace declaration authorizedRoots: ${cwd}` };
  }
  let extraConfigPaths: readonly string[] = [];
  if (explicitConfigPaths !== undefined) {
    if (
      !Array.isArray(explicitConfigPaths) ||
      explicitConfigPaths.some((p) => typeof p !== "string" || p.length === 0 || p.includes("\0") || !isAbsolute(p))
    ) {
      return { ok: false, reason: "request.configPaths must be an array of non-empty NUL-free absolute paths" };
    }
    extraConfigPaths = dedupePaths(explicitConfigPaths);
  }
  // Always resolve the local Git layout regardless of whether request.configPaths was provided.
  const localConfig = resolveLocalConfig(rootReal);
  if (localConfig.gitDir === null || localConfig.commonDir === null) {
    return { ok: false, reason: `no readable Git repository layout found under ${cwd}` };
  }
  return { ok: true, rootReal, localConfig, extraConfigPaths };
}

function gateRepositoryConfig(
  exec: SafeGitExecutor,
  rootReal: string,
  localConfig: LocalConfigResolution,
  extraConfigPaths: readonly string[],
): { ok: true; gate: RepositoryConfigGate } | { ok: false; reason: string } {
  if (localConfig.gitDir === null || localConfig.commonDir === null) {
    return { ok: false, reason: `no readable Git repository layout found under ${rootReal}` };
  }
  const configPaths = dedupePaths([...localConfig.paths, ...extraConfigPaths]);
  const monitoredPaths = dedupePaths([...localConfig.monitoredPaths, ...extraConfigPaths]);
  if (configPaths.length === 0) {
    return { ok: false, reason: `no repository configuration files resolved to gate under ${rootReal}` };
  }
  const regularCheck = assertRegularConfigPaths(configPaths, monitoredPaths);
  if (!regularCheck.ok) return regularCheck;
  try {
    exec.assertNoConfigIncludes(configPaths);
    const fingerprint = fingerprintConfigPaths(monitoredPaths);
    const gitDir = exec.run(rootReal, ["rev-parse", "--absolute-git-dir"]).toString("utf8").trim();
    const commonDir = exec.run(rootReal, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).toString("utf8").trim();
    const realGit = tryRealpath(gitDir);
    const realLocalGit = tryRealpath(localConfig.gitDir);
    const realCommon = tryRealpath(commonDir);
    const realLocalCommon = tryRealpath(localConfig.commonDir);
    if (
      realGit === null ||
      realLocalGit === null ||
      normalizePath(realGit) !== normalizePath(realLocalGit) ||
      realCommon === null ||
      realLocalCommon === null ||
      normalizePath(realCommon) !== normalizePath(realLocalCommon)
    ) {
      return { ok: false, reason: "resolved git-dir/common-dir disagrees with rev-parse; refusing ungated repository" };
    }
    return {
      ok: true,
      gate: {
        rootReal,
        realGitDir: normalizePath(realGit),
        realCommonDir: normalizePath(realCommon),
        configPaths,
        monitoredPaths,
        extraConfigPaths,
        fingerprint,
      },
    };
  } catch (error) {
    return { ok: false, reason: `Git repository configuration gate failed or refused: ${errorDetail(error)}` };
  }
}

function verifyRepositoryConfigGate(
  exec: SafeGitExecutor,
  gate: RepositoryConfigGate,
): { ok: true } | { ok: false; reason: string } {
  const endLocal = resolveLocalConfig(gate.rootReal);
  if (endLocal.gitDir === null || endLocal.commonDir === null) {
    return { ok: false, reason: "repository git-dir/common-dir became unreadable during round" };
  }
  const endRealGit = tryRealpath(endLocal.gitDir);
  const endRealCommon = tryRealpath(endLocal.commonDir);
  if (
    endRealGit === null ||
    endRealCommon === null ||
    normalizePath(endRealGit) !== gate.realGitDir ||
    normalizePath(endRealCommon) !== gate.realCommonDir
  ) {
    return { ok: false, reason: "repository git-dir/common-dir changed during round" };
  }
  const endConfigPaths = dedupePaths([...gate.configPaths, ...endLocal.paths, ...gate.extraConfigPaths]);
  const endMonitoredPaths = dedupePaths([...endLocal.monitoredPaths, ...gate.extraConfigPaths]);
  const endRegularCheck = assertRegularConfigPaths(endConfigPaths, endMonitoredPaths);
  if (!endRegularCheck.ok) return endRegularCheck;
  try {
    if (!exec.probeNoConfigIncludes(endConfigPaths)) {
      return { ok: false, reason: "repository configuration changed or failed end-of-round include re-probe" };
    }
  } catch (error) {
    return { ok: false, reason: `repository configuration end-of-round include re-probe refused: ${errorDetail(error)}` };
  }
  const endFingerprint = fingerprintConfigPaths(endMonitoredPaths);
  if (endFingerprint !== gate.fingerprint) {
    return { ok: false, reason: "repository configuration content or metadata changed during round (fingerprint mismatch)" };
  }
  return { ok: true };
}

function observeLiveRefs(
  exec: SafeGitExecutor,
  cwd: string,
  observedAt: number,
  priorObservations?: readonly RawRefObservationDto[],
): { readonly oidAlgorithm: OidAlgorithm; readonly observations: readonly RawRefObservationDto[] } {
  const formatText = exec.run(cwd, ["rev-parse", "--show-object-format"]).toString("utf8").trim();
  if (formatText !== "sha1" && formatText !== "sha256") {
    throw new Error(`unsupported Git object format: ${formatText}`);
  }
  const oidAlgorithm: OidAlgorithm = formatText;
  const rawOut = exec
    .run(cwd, [
      "for-each-ref",
      "--sort=refname",
      "--format=%(refname)%00%(objectname)%00%(committerdate:unix)",
    ])
    .toString("utf8");

  const observations: RawRefObservationDto[] = [];
  const presentRefs = new Set<string>();
  for (const line of rawOut.split("\n")) {
    if (line.length === 0) continue;
    const parts = line.split("\0");
    if (parts.length !== 3) {
      throw new Error(`malformed for-each-ref record: ${line.slice(0, 80)}`);
    }
    const [refName, oid, committerUnixRaw] = parts as [string, string, string];
    const committerUnix = committerUnixRaw.length > 0 ? Number(committerUnixRaw) : undefined;
    const obs: RawRefObservationDto = {
      refName,
      oid,
      observedAt,
      ...(committerUnix !== undefined && Number.isSafeInteger(committerUnix)
        ? { tipCommitterUnixSeconds: committerUnix }
        : {}),
    };
    const checked = validateRawRefObservation(obs);
    if (!checked.ok) {
      throw new Error(`invalid live ref observation for ${refName}: ${checked.errors.join("; ")}`);
    }
    presentRefs.add(refName);
    observations.push(obs);
  }

  // Detect refs that were previously live and are now absent (deletion observations).
  if (priorObservations !== undefined && priorObservations.length > 0) {
    const latestPriorByRef = new Map<string, RawRefObservationDto>();
    for (const prior of priorObservations) {
      const checked = validateRawRefObservation(prior);
      if (!checked.ok) {
        throw new Error(`invalid prior ref observation for ${prior.refName}: ${checked.errors.join("; ")}`);
      }
      const existing = latestPriorByRef.get(prior.refName);
      if (existing === undefined || prior.observedAt >= existing.observedAt) {
        latestPriorByRef.set(prior.refName, prior);
      }
    }
    for (const [refName, latest] of [...latestPriorByRef.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (latest.absent !== true && !presentRefs.has(refName)) {
        observations.push({
          refName,
          oid: "",
          observedAt,
          absent: true,
        });
      }
    }
  }

  observations.sort((left, right) => left.refName.localeCompare(right.refName));
  return { oidAlgorithm, observations };
}

function resolveCurrentWorktreeHead(
  exec: SafeGitExecutor,
  cwd: string,
  worktreeId: string,
  trackedRefs: readonly TrackedRefDto[],
): WorktreeHeadRef {
  const sym = exec.probe(cwd, ["symbolic-ref", "HEAD"]);
  if (sym.status === 0) {
    const refName = sym.stdout.toString("utf8").trim();
    const tracked = trackedRefs.find((entry) => entry.refName === refName);
    const head: WorktreeHead =
      tracked !== undefined && tracked.oid !== null && tracked.deletedAt === null
        ? { kind: "branch", refName }
        : { kind: "unborn" };
    return { worktreeId, head };
  }
  const detached = exec.probe(cwd, ["rev-parse", "--verify", "HEAD"]);
  if (detached.status === 0) {
    const oid = detached.stdout.toString("utf8").trim();
    if (/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(oid)) {
      return { worktreeId, head: { kind: "detached", oid } };
    }
  }
  return { worktreeId, head: { kind: "unborn" } };
}

const HARDENED_GIT_CONFIG_KEYS: ReadonlySet<string> = new Set([
  "core.fsmonitor",
  "core.hookspath",
  "core.attributesfile",
  "core.excludesfile",
  "gc.auto",
  "maintenance.auto",
  "protocol.allow",
  "core.quotepath",
  "mailmap.file",
  "mailmap.blob",
]);

function buildHardenedGitPrefix(disabledHooksDir: string): readonly string[] {
  // Mirrors SafeGitExecutor's full hardening prefix (`engram-live/git-executor.ts:326-349`).
  return [
    "--no-pager",
    "--no-optional-locks",
    "-c",
    "core.fsmonitor=false",
    "-c",
    `core.hooksPath=${disabledHooksDir}`,
    "-c",
    "core.attributesFile=/dev/null",
    "-c",
    "core.excludesFile=/dev/null",
    "-c",
    "gc.auto=0",
    "-c",
    "maintenance.auto=false",
    "-c",
    "protocol.allow=never",
    "-c",
    "core.quotePath=true",
    "-c",
    "mailmap.file=/dev/null",
    "-c",
    "mailmap.blob=",
  ];
}

function buildHardenedGitProcessPort(
  inner: GitProcessPort,
  disabledHooksDir: string,
): GitProcessPort {
  const hardenedPrefix = buildHardenedGitPrefix(disabledHooksDir);
  return {
    start(launch) {
      const preservedLeading: string[] = [];
      let index = 0;
      while (index < launch.args.length) {
        const arg = launch.args[index]!;
        if (arg === "--no-pager" || arg === "--no-optional-locks") {
          index += 1;
          continue;
        }
        if (arg === "-c" && index + 1 < launch.args.length) {
          const kv = launch.args[index + 1]!;
          const eq = kv.indexOf("=");
          const key = (eq === -1 ? kv : kv.slice(0, eq)).toLowerCase();
          if (!HARDENED_GIT_CONFIG_KEYS.has(key)) {
            preservedLeading.push(arg, kv);
          }
          index += 2;
          continue;
        }
        break;
      }
      const hardenedArgs = [...preservedLeading, ...hardenedPrefix, ...launch.args.slice(index)];
      return inner.start({
        cwd: launch.cwd,
        purpose: launch.purpose,
        args: hardenedArgs,
      });
    },
  };
}

/**
 * Normalize L2a raw status tokens like `"R100"` or `"C095"` to the single-letter
 * `GitFileChangeStatus` admitted by L3a-E1 `validateChangedFileFact`, preserving
 * `statusScore` intact without mutating any L2a/L2b producer module.
 */
function normalizeHistoryCommitForTypedFacts(fact: HistoryCommitFactDto): HistoryCommitFactDto {
  return {
    ...fact,
    parentDiffs: fact.parentDiffs.map((diff) => ({
      parentIndex: diff.parentIndex,
      files: diff.files.map((file) => {
        const match = /^([A-Z])(\d+)$/.exec(file.status);
        if (!match) return file;
        const letter = match[1]!;
        const parsedScore = Number.parseInt(match[2]!, 10);
        return {
          ...file,
          status: letter,
          statusScore: file.statusScore ?? (Number.isSafeInteger(parsedScore) ? parsedScore : null),
        };
      }),
    })),
  };
}

function chunkFacts(
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

async function deliverTypedFencedBatches(params: {
  readonly capability: "refs" | "history-dag" | "github-pr" | "retention-requests";
  readonly declaration: WorkspaceDeclarationDto;
  readonly generationId: string;
  readonly fencingToken: ScopeFencingTokenDto;
  readonly expectedIncarnation?: string;
  readonly maxBatchBytes: number;
  readonly facts: readonly LiveFactDto[];
  readonly clock: { now(): number };
  readonly factSink: FactSinkPort;
}): Promise<{ ok: true; batches: DeliveredBatchSummary[] } | { ok: false; reason: string }> {
  const cloneScope: LiveScope = { tenant: params.declaration.tenant, clone: params.declaration.cloneId };
  const genDigits = params.generationId.slice("gen:".length);
  let builtBatches: ReturnType<typeof buildFactBatch>[];
  try {
    builtBatches = chunkFacts(params.facts, params.maxBatchBytes, (chunk, seq) =>
      buildFactBatch(
        {
          scope: cloneScope,
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
    return { ok: false, reason: `failed to build canonical typed fact batch: ${errorDetail(error)}` };
  }

  const summaries: DeliveredBatchSummary[] = [];
  for (const item of builtBatches) {
    const tick = readClockMs(params.clock);
    if (!tick.ok) return tick;
    const rechecked = validateCommittedFencingToken(
      params.fencingToken,
      params.declaration,
      tick.nowMs,
      params.expectedIncarnation,
    );
    if (!rechecked.ok) return rechecked;
    let receipt: FactSinkReceipt;
    try {
      receipt = await params.factSink.deliver(item.batch, rechecked.token);
    } catch (error) {
      return { ok: false, reason: `fact sink refused batch ${item.batch.batchId}: ${errorDetail(error)}` };
    }
    if (
      !receipt ||
      typeof receipt !== "object" ||
      receipt.received !== true ||
      receipt.batchId !== item.batch.batchId
    ) {
      return {
        ok: false,
        reason: `fact sink returned invalid acknowledgement for batch ${item.batch.batchId}`,
      };
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

function isHistoryPersistencePort(value: unknown): value is HistoryPersistencePort {
  if (!value || typeof value !== "object") return false;
  const port = value as Partial<HistoryPersistencePort>;
  return (
    typeof port.loadCompletion === "function" &&
    typeof port.persistCommitFact === "function" &&
    typeof port.recordCompletion === "function" &&
    typeof port.recordRetainedRoot === "function"
  );
}

function isGithubPrTransportPort(value: unknown): value is GithubPrTransportPort {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Partial<GithubPrTransportPort>).fetchPage === "function";
}

function isPrSyncPersistencePort(value: unknown): value is PrSyncPersistencePort {
  if (!value || typeof value !== "object") return false;
  const port = value as Partial<PrSyncPersistencePort>;
  return (
    typeof port.loadCursor === "function" &&
    typeof port.saveCursor === "function" &&
    typeof port.saveObservation === "function" &&
    typeof port.listObservations === "function" &&
    typeof port.recordObjectJob === "function" &&
    typeof port.updateObjectJob === "function" &&
    typeof port.listObjectJobs === "function"
  );
}

function isRetentionPort(value: unknown): value is RetentionPort {
  if (!value || typeof value !== "object") return false;
  const port = value as Partial<RetentionPort>;
  return (
    typeof port.recordRequest === "function" &&
    typeof port.recordReceipt === "function" &&
    typeof port.loadReceipts === "function"
  );
}

function isGitProcessPort(value: unknown): value is GitProcessPort {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Partial<GitProcessPort>).start === "function";
}

/**
 * Execute the `refs` capability (L2a/L2b): observe refs via the validated
 * host-isolated `SafeGitExecutor`, fold creation/deletion/recreation states
 * via `trackRef`, select history roots via `selectHistoryRoots`, and deliver
 * canonical typed `ref-observation`, `ref-state` and `coverage` facts fenced
 * by the clone-scoped token through `FactSinkPort`.
 */
export async function runRefsCapability(
  status: CapabilityStatus,
  ctx: CommittedHistoryRuntimeContext,
  request: unknown,
): Promise<RefsCapabilityResult | UnavailableCapabilityResult> {
  if (!isPlainObject(request)) {
    return unavailable(status, 'capability "refs" requires a plain-object request (never reported available without executing its engine)');
  }
  const sinkCheck = validateFactSinkPort(ctx.factSink);
  if (!sinkCheck.ok) return unavailable(status, sinkCheck.reason);
  const clockCheck = readClockMs(ctx.clock);
  if (!clockCheck.ok) return unavailable(status, clockCheck.reason);

  const batchCtx = validateBatchContext(request, ctx.declaration, clockCheck.nowMs);
  if (!batchCtx.ok) return unavailable(status, batchCtx.reason);

  const defaultBranch = request.defaultBranch;
  if (typeof defaultBranch !== "string" || !defaultBranch.startsWith("refs/") || defaultBranch.includes("\0")) {
    return unavailable(status, 'refs request requires a full defaultBranch ref name starting with "refs/"');
  }
  const repoCheck = authorizeAndResolveRepo(
    request.cwd,
    ctx.declaration.authorizedRoots,
    request.configPaths as readonly string[] | undefined,
  );
  if (!repoCheck.ok) return unavailable(status, repoCheck.reason);

  const observedPaths = [
    repoCheck.rootReal,
    ...(repoCheck.localConfig.gitDir ? [repoCheck.localConfig.gitDir] : []),
    ...(repoCheck.localConfig.commonDir ? [repoCheck.localConfig.commonDir] : []),
  ];
  const execCheck = composeFactoryGitExecutor(ctx.git, {
    authorizedRoots: ctx.declaration.authorizedRoots,
    observedPaths,
  });
  if (!execCheck.ok) return unavailable(status, execCheck.reason);

  const gateCheck = gateRepositoryConfig(
    execCheck.executor,
    repoCheck.rootReal,
    repoCheck.localConfig,
    repoCheck.extraConfigPaths,
  );
  if (!gateCheck.ok) return unavailable(status, gateCheck.reason);

  if (request.priorObservations !== undefined && !Array.isArray(request.priorObservations)) {
    return unavailable(status, "refs request.priorObservations must be an array when supplied");
  }
  if (request.retainedRoots !== undefined && !Array.isArray(request.retainedRoots)) {
    return unavailable(status, "refs request.retainedRoots must be an array when supplied");
  }
  if (request.worktreeHeads !== undefined && !Array.isArray(request.worktreeHeads)) {
    return unavailable(status, "refs request.worktreeHeads must be an array when supplied");
  }
  const priorObservations = request.priorObservations as readonly RawRefObservationDto[] | undefined;
  const retainedRoots = (request.retainedRoots as readonly RetainedRootDto[] | undefined) ?? [];
  const requestedWorktreeHeads = request.worktreeHeads as readonly WorktreeHeadRef[] | undefined;
  for (const retained of retainedRoots) {
    if (!retained || typeof retained !== "object" || retained.cloneId !== ctx.declaration.cloneId) {
      return unavailable(status, "refs request.retainedRoots entries must match workspace declaration cloneId");
    }
  }

  let oidAlgorithm: OidAlgorithm;
  let freshObservations: readonly RawRefObservationDto[];
  let trackedRefs: TrackedRefDto[];
  let roots: readonly SelectedRootDto[];
  try {
    const observed = observeLiveRefs(execCheck.executor, repoCheck.rootReal, clockCheck.nowMs, priorObservations);
    oidAlgorithm = observed.oidAlgorithm;
    freshObservations = observed.observations;

    const byRef = new Map<string, RawRefObservationDto[]>();
    for (const obs of [...(priorObservations ?? []), ...freshObservations]) {
      const list = byRef.get(obs.refName) ?? [];
      list.push(obs);
      byRef.set(obs.refName, list);
    }
    trackedRefs = [...byRef.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([refName, list]) => trackRef(refName, list));

    const worktreeHeads =
      requestedWorktreeHeads !== undefined
        ? requestedWorktreeHeads
        : [resolveCurrentWorktreeHead(execCheck.executor, repoCheck.rootReal, ctx.declaration.worktreeId, trackedRefs)];

    roots = selectHistoryRoots({
      trackedRefs,
      worktreeHeads,
      defaultBranch,
      retainedRoots,
      now: clockCheck.nowMs,
      oidAlgorithm,
    });
  } catch (error) {
    return unavailable(status, `refs execution failed or Git port refused: ${errorDetail(error)}`);
  }

  const endGate = verifyRepositoryConfigGate(execCheck.executor, gateCheck.gate);
  if (!endGate.ok) return unavailable(status, endGate.reason);

  const cloneId = ctx.declaration.cloneId;
  const trackedByName = new Map(trackedRefs.map((entry) => [entry.refName, entry]));
  const facts: LiveFactDto[] = [];
  for (const obs of freshObservations) {
    const refKind = classifyRefName(obs.refName);
    if (refKind === null) {
      return unavailable(status, `observed invalid ref name "${obs.refName}"`);
    }
    const generation = trackedByName.get(obs.refName)?.generation ?? (obs.absent ? 0 : 1);
    facts.push(toRefObservationFact(cloneId, oidAlgorithm, refKind, obs, generation));
  }
  for (const tracked of trackedRefs) {
    facts.push(toTrackedRefFact(cloneId, oidAlgorithm, tracked));
  }
  const refsCoverage: CoverageFactDto = {
    kind: "coverage",
    schemaVersion: FACT_SCHEMA_VERSION,
    axis: "refs",
    state: "current",
    reason: `observed ${freshObservations.length} ref(s), tracked ${trackedRefs.length} ref(s), selected ${roots.length} history root(s)`,
    checkedAt: clockCheck.nowMs,
    lastSuccessAt: clockCheck.nowMs,
  };
  facts.push(refsCoverage);

  const delivered = await deliverTypedFencedBatches({
    capability: "refs",
    declaration: ctx.declaration,
    generationId: batchCtx.generationId,
    fencingToken: batchCtx.fencingToken,
    expectedIncarnation: batchCtx.expectedIncarnation,
    maxBatchBytes: batchCtx.maxBatchBytes,
    facts,
    clock: ctx.clock!,
    factSink: sinkCheck.sink,
  });
  if (!delivered.ok) return unavailable(status, delivered.reason);

  return {
    ...status,
    capability: "refs",
    state: "available",
    delivered: true,
    generationId: batchCtx.generationId,
    oidAlgorithm,
    observations: freshObservations,
    trackedRefs,
    roots,
    batches: delivered.batches,
  };
}

/**
 * Execute the `history-dag` capability (L2b): gate repository config via the
 * host-isolated `SafeGitExecutor`, stream uncapped commit/DAG/changed-file
 * history through `runHistoryPass` over the injected `GitProcessPort` and
 * `HistoryPersistencePort`, and deliver canonical typed `commit`,
 * `changed-file`, `progress` (`retained-root`, `history-checkpoint`) and
 * `coverage` (`dag`) facts fenced by the clone-scoped token through `FactSinkPort`.
 */
export async function runHistoryDagCapability(
  status: CapabilityStatus,
  ctx: CommittedHistoryRuntimeContext,
  request: unknown,
): Promise<HistoryDagCapabilityResult | UnavailableCapabilityResult> {
  if (!isPlainObject(request)) {
    return unavailable(status, 'capability "history-dag" requires a plain-object request (never reported available without executing its engine)');
  }
  const sinkCheck = validateFactSinkPort(ctx.factSink);
  if (!sinkCheck.ok) return unavailable(status, sinkCheck.reason);
  const clockCheck = readClockMs(ctx.clock);
  if (!clockCheck.ok) return unavailable(status, clockCheck.reason);

  const batchCtx = validateBatchContext(request, ctx.declaration, clockCheck.nowMs);
  if (!batchCtx.ok) return unavailable(status, batchCtx.reason);

  const persistence = request.persistence ?? ctx.historyPersistence;
  if (!isHistoryPersistencePort(persistence)) {
    return unavailable(status, "missing host history persistence port (ports.historyPersistence)");
  }

  const repository = request.repository as RepositoryObservationDto | undefined;
  if (!repository || typeof repository !== "object" || !repository.clone || repository.clone.cloneId !== ctx.declaration.cloneId) {
    return unavailable(status, "history-dag request.repository must match workspace declaration cloneId");
  }
  const defaultBranch = request.defaultBranch;
  if (typeof defaultBranch !== "string" || !defaultBranch.startsWith("refs/") || defaultBranch.includes("\0")) {
    return unavailable(status, 'history-dag request requires a full defaultBranch ref name starting with "refs/"');
  }

  const repoCheck = authorizeAndResolveRepo(
    request.cwd,
    ctx.declaration.authorizedRoots,
    request.configPaths as readonly string[] | undefined,
  );
  if (!repoCheck.ok) return unavailable(status, repoCheck.reason);

  const observedPaths = [
    repoCheck.rootReal,
    ...(repoCheck.localConfig.gitDir ? [repoCheck.localConfig.gitDir] : []),
    ...(repoCheck.localConfig.commonDir ? [repoCheck.localConfig.commonDir] : []),
  ];
  const execCheck = composeFactoryGitExecutor(ctx.git, {
    authorizedRoots: ctx.declaration.authorizedRoots,
    observedPaths,
  });
  if (!execCheck.ok) return unavailable(status, execCheck.reason);

  if (!isGitProcessPort(ctx.git?.process)) {
    return unavailable(status, "missing host streaming Git process port (ports.git.process)");
  }

  const gateCheck = gateRepositoryConfig(
    execCheck.executor,
    repoCheck.rootReal,
    repoCheck.localConfig,
    repoCheck.extraConfigPaths,
  );
  if (!gateCheck.ok) return unavailable(status, gateCheck.reason);

  const declCommonReal = tryRealpath(repository.clone.commonDirRealpath);
  if (declCommonReal === null || gateCheck.gate.realCommonDir !== normalizePath(declCommonReal)) {
    return unavailable(status, "history-dag request.repository commonDirRealpath does not match observed repository");
  }

  let refObservations: readonly RawRefObservationDto[];
  try {
    const formatText = execCheck.executor.run(repoCheck.rootReal, ["rev-parse", "--show-object-format"]).toString("utf8").trim();
    if (formatText !== repository.clone.oidAlgorithm) {
      return unavailable(
        status,
        `history-dag request.repository oidAlgorithm (${repository.clone.oidAlgorithm}) does not match observed repository (${formatText})`,
      );
    }
    if (request.refObservations !== undefined) {
      if (!Array.isArray(request.refObservations)) {
        return unavailable(status, "history-dag request.refObservations must be an array when supplied");
      }
      refObservations = request.refObservations as readonly RawRefObservationDto[];
    } else {
      refObservations = observeLiveRefs(execCheck.executor, repoCheck.rootReal, clockCheck.nowMs).observations;
    }
  } catch (error) {
    return unavailable(status, `history-dag ref observation failed or Git port refused: ${errorDetail(error)}`);
  }

  // Buffer all history persistence writes in memory until both end-of-round
  // config integrity checks and fenced FactSinkPort delivery succeed.
  const stagedWrites: StagedHistoryWrite[] = [];
  const capturedRoots: RetainedRootDto[] = [];
  const capturedCommits: HistoryCommitFactDto[] = [];
  const capturedCheckpoints: HistoryCheckpointDto[] = [];
  const stagingPersistence: HistoryPersistencePort = {
    loadCompletion: (query) => persistence.loadCompletion(query),
    async persistCommitFact(fact) {
      stagedWrites.push({ kind: "commit-fact", value: fact });
      capturedCommits.push(fact);
      return { received: true };
    },
    async recordCompletion(checkpoint) {
      stagedWrites.push({ kind: "completion", value: checkpoint });
      capturedCheckpoints.push(checkpoint);
      return { received: true };
    },
    async recordRetainedRoot(retained) {
      stagedWrites.push({ kind: "retained-root", value: retained });
      capturedRoots.push(retained);
      return { received: true };
    },
  };

  let outcome: HistoryPassOutcome;
  try {
    outcome = await runHistoryPass(
      {
        repository,
        defaultBranch,
        refObservations,
        now: clockCheck.nowMs,
        cwd: repoCheck.rootReal,
      },
      {
        git: buildHardenedGitProcessPort(ctx.git.process, execCheck.disabledHooksDir),
        persistence: stagingPersistence,
      },
    );
  } catch (error) {
    return unavailable(status, `history-dag execution failed or port refused: ${errorDetail(error)}`);
  }

  const endGate = verifyRepositoryConfigGate(execCheck.executor, gateCheck.gate);
  if (!endGate.ok) return unavailable(status, endGate.reason);

  const facts: LiveFactDto[] = [];
  for (const retained of capturedRoots) {
    facts.push(toRetainedRootProgressFact(retained));
  }
  for (const commitFact of capturedCommits) {
    const normalized = normalizeHistoryCommitForTypedFacts(commitFact);
    const { commit, changedFiles } = toCommitAndChangedFileFacts(normalized);
    facts.push(commit, ...changedFiles);
  }
  for (const checkpoint of capturedCheckpoints) {
    facts.push(toHistoryCheckpointProgressFact(checkpoint));
  }
  if (outcome.coverage.length > 0) {
    for (const report of outcome.coverage) {
      const cov: CoverageFactDto = {
        kind: "coverage",
        schemaVersion: FACT_SCHEMA_VERSION,
        axis: "dag",
        state: report.state,
        reason: report.reason,
        checkedAt: clockCheck.nowMs,
        cause: report.cause,
        ...(report.boundary !== undefined ? { boundary: report.boundary } : {}),
        ...(report.missing !== undefined ? { missing: report.missing } : {}),
      };
      facts.push(cov);
    }
  } else {
    facts.push({
      kind: "coverage",
      schemaVersion: FACT_SCHEMA_VERSION,
      axis: "dag",
      state: "current",
      reason: `history pass complete: ${outcome.stats.commitsExtracted} extracted, ${outcome.stats.commitsSkippedComplete} skipped complete across ${outcome.stats.rootsSelected} root(s)`,
      checkedAt: clockCheck.nowMs,
      lastSuccessAt: clockCheck.nowMs,
    });
  }

  const delivered = await deliverTypedFencedBatches({
    capability: "history-dag",
    declaration: ctx.declaration,
    generationId: batchCtx.generationId,
    fencingToken: batchCtx.fencingToken,
    expectedIncarnation: batchCtx.expectedIncarnation,
    maxBatchBytes: batchCtx.maxBatchBytes,
    facts,
    clock: ctx.clock!,
    factSink: sinkCheck.sink,
  });
  if (!delivered.ok) return unavailable(status, delivered.reason);

  // Re-verify active fencing lease before committing staged durable persistence writes.
  const commitTick = readClockMs(ctx.clock);
  if (!commitTick.ok) return unavailable(status, commitTick.reason);
  const commitFence = validateCommittedFencingToken(
    batchCtx.fencingToken,
    ctx.declaration,
    commitTick.nowMs,
    batchCtx.expectedIncarnation,
  );
  if (!commitFence.ok) return unavailable(status, commitFence.reason);

  try {
    for (const write of stagedWrites) {
      let receipt: { readonly received: true };
      if (write.kind === "retained-root") {
        receipt = await persistence.recordRetainedRoot(write.value);
      } else if (write.kind === "commit-fact") {
        receipt = await persistence.persistCommitFact(write.value);
      } else {
        receipt = await persistence.recordCompletion(write.value);
      }
      if (!receipt || receipt.received !== true) {
        return unavailable(
          status,
          `history-dag persistence returned invalid acknowledgement while committing ${write.kind}`,
        );
      }
    }
  } catch (error) {
    return unavailable(status, `history-dag persistence commit failed or refused: ${errorDetail(error)}`);
  }

  return {
    ...status,
    capability: "history-dag",
    state: "available",
    delivered: true,
    generationId: batchCtx.generationId,
    outcome,
    batches: delivered.batches,
  };
}

/**
 * Execute the `github-pr` capability (P1): paginate all PR states over the
 * injected `GithubPrTransportPort` and `PrSyncPersistencePort` (no network in
 * engram), pin optional per-PR attributions via `pinPrAttribution`, and deliver
 * canonical typed `pr-observation`, `pr-attribution`, `progress` (`pr-cursor`,
 * `pr-object-job`) and `coverage` facts fenced by the clone-scoped token
 * through `FactSinkPort`.
 */
export async function runGithubPrCapability(
  status: CapabilityStatus,
  ctx: CommittedHistoryRuntimeContext,
  request: unknown,
): Promise<GithubPrCapabilityResult | UnavailableCapabilityResult> {
  if (!isPlainObject(request)) {
    return unavailable(status, 'capability "github-pr" requires a plain-object request (never reported available without executing its engine)');
  }
  const sinkCheck = validateFactSinkPort(ctx.factSink);
  if (!sinkCheck.ok) return unavailable(status, sinkCheck.reason);
  const clockCheck = readClockMs(ctx.clock);
  if (!clockCheck.ok) return unavailable(status, clockCheck.reason);

  const batchCtx = validateBatchContext(request, ctx.declaration, clockCheck.nowMs);
  if (!batchCtx.ok) return unavailable(status, batchCtx.reason);

  if (!isGithubPrTransportPort(ctx.githubPr)) {
    return unavailable(status, "missing host GitHub PR transport port (ports.githubPr)");
  }
  const persistence = request.persistence ?? ctx.prPersistence;
  if (!isPrSyncPersistencePort(persistence)) {
    return unavailable(status, "missing host GitHub PR persistence port (ports.prPersistence)");
  }

  const repoChecked = validateGithubRepository(request.repository);
  if (!repoChecked.ok) {
    return unavailable(status, `invalid github-pr request.repository: ${repoChecked.errors.join("; ")}`);
  }
  const repository = request.repository as GithubRepositoryDto;
  const sweepKind = request.sweepKind;
  if (sweepKind !== "incremental" && sweepKind !== "full") {
    return unavailable(status, 'github-pr request.sweepKind must be "incremental" or "full"');
  }

  const attributions: PrAttributionDto[] = [];
  if (request.attributions !== undefined) {
    if (!Array.isArray(request.attributions)) {
      return unavailable(status, "github-pr request.attributions must be an array when supplied");
    }
    try {
      for (const rawEntry of request.attributions) {
        if (!isPlainObject(rawEntry)) {
          return unavailable(status, "github-pr request.attributions entries must be plain objects");
        }
        const entry = rawEntry as unknown as PinPrAttributionInput;
        if (entry.repositoryOwner !== repository.owner || entry.repositoryRepo !== repository.repo) {
          return unavailable(status, "github-pr attribution targets a different repository than request.repository");
        }
        const pinned = pinPrAttribution(entry);
        const attrChecked = validatePrAttribution(pinned);
        if (!attrChecked.ok) {
          return unavailable(status, `invalid github-pr attribution: ${attrChecked.errors.join("; ")}`);
        }
        attributions.push(pinned);
      }
    } catch (error) {
      return unavailable(status, `invalid github-pr request.attributions: ${errorDetail(error)}`);
    }
  }

  let outcome: PrSyncOutcome;
  let objectJobs: PrObjectJobDto[];
  try {
    outcome = await runPrSyncPass(
      { repository, sweepKind, now: clockCheck.nowMs },
      { transport: ctx.githubPr, persistence },
    );
    // A refusing or unreachable GitHub transport produces `outcome.state === "stale"`;
    // surface explicit unavailability rather than reporting an available empty success.
    if (outcome.state !== "complete") {
      const detail = outcome.coverage[0]?.reason ?? "GitHub PR transport refused or unavailable";
      return unavailable(status, `github-pr transport unavailable: ${detail}`);
    }
    const rawJobs = await persistence.listObjectJobs(repository);
    objectJobs = [...rawJobs].sort((a, b) => objectJobIdentityKey(a).localeCompare(objectJobIdentityKey(b)));
  } catch (error) {
    return unavailable(status, `github-pr execution failed or port refused: ${errorDetail(error)}`);
  }

  const cloneId = ctx.declaration.cloneId;
  const facts: LiveFactDto[] = [];
  for (const obs of outcome.observations) {
    facts.push(toPullRequestObservationFact(cloneId, obs));
  }
  for (const attr of attributions) {
    facts.push(toPrAttributionFact(cloneId, attr));
  }
  facts.push(toPrCursorProgressFact(cloneId, outcome.cursor));
  for (const job of objectJobs) {
    facts.push(toPrObjectJobProgressFact(cloneId, job));
  }
  for (const cov of outcome.coverage) {
    facts.push({
      kind: "coverage",
      schemaVersion: FACT_SCHEMA_VERSION,
      axis: cov.axis,
      state: cov.state,
      reason: cov.reason,
      checkedAt: clockCheck.nowMs,
      ...(cov.lastSuccessAt !== undefined ? { lastSuccessAt: cov.lastSuccessAt } : {}),
    });
  }

  const delivered = await deliverTypedFencedBatches({
    capability: "github-pr",
    declaration: ctx.declaration,
    generationId: batchCtx.generationId,
    fencingToken: batchCtx.fencingToken,
    expectedIncarnation: batchCtx.expectedIncarnation,
    maxBatchBytes: batchCtx.maxBatchBytes,
    facts,
    clock: ctx.clock!,
    factSink: sinkCheck.sink,
  });
  if (!delivered.ok) return unavailable(status, delivered.reason);

  return {
    ...status,
    capability: "github-pr",
    state: "available",
    delivered: true,
    generationId: batchCtx.generationId,
    outcome,
    attributions,
    objectJobs,
    batches: delivered.batches,
  };
}

/**
 * Execute the `retention-requests` capability (R1): derive scoped retention
 * requests for every selected root, record requests and verify scoped durable
 * receipts through the injected `RetentionPort` via `runRetentionPass`, and
 * deliver canonical typed `retention-receipt` and `coverage`
 * (`object-availability`) facts fenced by the clone-scoped token through
 * `FactSinkPort`.
 */
export async function runRetentionRequestsCapability(
  status: CapabilityStatus,
  ctx: CommittedHistoryRuntimeContext,
  request: unknown,
): Promise<RetentionRequestsCapabilityResult | UnavailableCapabilityResult> {
  if (!isPlainObject(request)) {
    return unavailable(status, 'capability "retention-requests" requires a plain-object request (never reported available without executing its engine)');
  }
  const sinkCheck = validateFactSinkPort(ctx.factSink);
  if (!sinkCheck.ok) return unavailable(status, sinkCheck.reason);
  const clockCheck = readClockMs(ctx.clock);
  if (!clockCheck.ok) return unavailable(status, clockCheck.reason);

  const batchCtx = validateBatchContext(request, ctx.declaration, clockCheck.nowMs);
  if (!batchCtx.ok) return unavailable(status, batchCtx.reason);

  const retentionPort = request.retention ?? ctx.retention;
  if (!isRetentionPort(retentionPort)) {
    return unavailable(status, "missing host retention port (ports.retention)");
  }
  if (!Array.isArray(request.roots)) {
    return unavailable(status, "retention-requests request.roots must be an array of SelectedRootDto");
  }
  const roots = request.roots as readonly SelectedRootDto[];

  const cloneScope: LiveScope = { tenant: ctx.declaration.tenant, clone: ctx.declaration.cloneId };
  const loadedReceipts = new Map<string, RetentionReceiptDto>();
  const capturingRetentionPort: RetentionPort = {
    recordRequest: (req) => retentionPort.recordRequest(req),
    recordReceipt: (receipt) => retentionPort.recordReceipt(receipt),
    async loadReceipts(query) {
      const result = await retentionPort.loadReceipts(query);
      for (const receipt of result.receipts) {
        if (
          validateRetentionReceipt(receipt).ok &&
          receipt.scope.tenant === cloneScope.tenant &&
          receipt.scope.clone === cloneScope.clone &&
          receipt.algorithm === query.algorithm
        ) {
          loadedReceipts.set(`${receipt.algorithm}:${receipt.oid}`, receipt);
        }
      }
      return result;
    },
  };

  let outcome: RetentionPassOutcome;
  try {
    outcome = await runRetentionPass(
      { roots, scope: cloneScope, now: clockCheck.nowMs },
      capturingRetentionPort,
    );
  } catch (error) {
    return unavailable(status, `retention-requests execution failed or retention port refused: ${errorDetail(error)}`);
  }

  const verifiedReceipts: RetentionReceiptDto[] = [];
  for (const req of outcome.requests) {
    const match = loadedReceipts.get(`${req.algorithm}:${req.oid}`);
    if (match !== undefined) verifiedReceipts.push(match);
  }
  verifiedReceipts.sort((a, b) => a.algorithm.localeCompare(b.algorithm) || a.oid.localeCompare(b.oid));

  const facts: LiveFactDto[] = [];
  for (const receipt of verifiedReceipts) {
    facts.push(toRetentionReceiptFact(receipt));
  }
  if (outcome.coverage.length > 0) {
    for (const report of outcome.coverage) {
      facts.push({
        kind: "coverage",
        schemaVersion: FACT_SCHEMA_VERSION,
        axis: report.axis,
        state: report.state,
        reason: report.reason,
        checkedAt: clockCheck.nowMs,
        cause: report.cause,
        ...(report.missing !== undefined ? { missing: report.missing } : {}),
      });
    }
  } else {
    facts.push({
      kind: "coverage",
      schemaVersion: FACT_SCHEMA_VERSION,
      axis: "object-availability",
      state: "current",
      reason: `private retention complete: ${outcome.stats.receipts} scoped durable receipt(s) verified for ${outcome.stats.requests} root(s)`,
      checkedAt: clockCheck.nowMs,
      lastSuccessAt: clockCheck.nowMs,
    });
  }

  const delivered = await deliverTypedFencedBatches({
    capability: "retention-requests",
    declaration: ctx.declaration,
    generationId: batchCtx.generationId,
    fencingToken: batchCtx.fencingToken,
    expectedIncarnation: batchCtx.expectedIncarnation,
    maxBatchBytes: batchCtx.maxBatchBytes,
    facts,
    clock: ctx.clock!,
    factSink: sinkCheck.sink,
  });
  if (!delivered.ok) return unavailable(status, delivered.reason);

  return {
    ...status,
    capability: "retention-requests",
    state: "available",
    delivered: true,
    generationId: batchCtx.generationId,
    outcome,
    receipts: verifiedReceipts,
    batches: delivered.batches,
  };
}
