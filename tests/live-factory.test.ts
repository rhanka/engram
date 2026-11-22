// E-ASM2 — Committed-history capabilities behind the neutral factory
// (plan/09 E-ASM2; spec/SPEC_LIVE_GIT_INDEXING.md §§3, 4, 5, 6, 7, 11).
//
// Test-first: exercises `refs`, `history-dag`, `github-pr` and
// `retention-requests` through `createLiveFactory(...).runCapability(...)`
// against L0 Git fixtures and P1 GitHub page fixtures, verifying:
//   1. typed L3a-E1 batches, L3a-E2 clone-scoped fencing tokens and L5-P-m8
//      single FactSinkPort delivery;
//   2. explicit `unavailable` (never an empty success) for every missing or
//      refusing port, missing request or invalid fencing token;
//   3. strict requirement of a host-injected hooks-isolation directory, with
//      zero Git executor composition without it and zero writes under the OS
//      temporary directory.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Language, Parser } from "web-tree-sitter";
import {
  buildCorpus,
  detectGitCapabilities,
  inventoryDigest,
  LiveGitSandbox,
} from "./helpers/live-git-fixtures.js";
import {
  CAPABILITY_IDS,
  CONTENT_POLICY_VERSION,
  CONTENT_UNAVAILABLE,
  CONTRACT_VERSION,
  COVERAGE_AXES,
  GENERATION_CONTROL_VERSION,
  POLICY_VERSION,
  PRODUCER_NAME,
  STORAGE_KERNEL_AUTHORITY,
  describeCapabilities,
  validateFactBatch,
  validateLocalSnapshot,
  validateRetentionReceipt,
  validateScopeFencingToken,
  validateSealedLocalDiff,
  type BatchDeliveryReceiptDto,
  type FactBatchDto,
  type FactSinkPort,
  type FactSinkReceipt,
  type GenerationCompletionMessageDto,
  type GenerationCompletionOutcomeDto,
  type GithubRepositoryDto,
  type HistoryCheckpointDto,
  type HistoryCommitFactDto,
  type HistoryCompletionQuery,
  type HistoryCompletionState,
  type HistoryPersistencePort,
  type LiveScope,
  type LocalDiffDto,
  type LocalDiffEndpointDto,
  type LocalSnapshotDto,
  type PrObjectJobDto,
  type PrPageDto,
  type PrSyncCursorDto,
  type PullRequestFactDto,
  type QualifiedOid,
  type RetainedRootDto,
  type RetentionReceiptDto,
  type RetentionRequestDto,
  type ScopeFencingTokenDto,
  type WorkspaceDeclarationDto,
} from "../engram-live/contracts.js";
import { decodeFactBatch, encodeFactBatch } from "../engram-live/batch-codec.js";
import { classifyLiveFactKind } from "../engram-live/facts.js";
import {
  createGenerationCorrelation,
  formatProducerGenerationId,
  type GenerationCompletionPort,
} from "../engram-live/generation.js";
import {
  createLiveFactory,
  deriveDeclarationIdentity,
  type GitPort,
  type GrammarRuntimePort,
  type LiveFactoryPorts,
} from "../engram-live/integration.js";
import { observeRepository } from "../engram-live/repository.js";
import {
  observationIdentityKey,
  type GithubPrTransportPort,
  type PrSyncPersistencePort,
  type PrTransportResult,
} from "../engram-live/pr-sync.js";
import type { RetentionPort } from "../engram-live/retention.js";
import type {
  GitLaunch,
  GitProcess,
  GitProcessExit,
  GitProcessPort,
} from "../engram-live/git-stream.js";
import type { GitSpawnFn } from "../engram-live/git-executor.js";
import { scanValuesForLeak, type KeyProviderPort } from "../engram-live/content-policy.js";
import type {
  ContentProtectionPort,
  LatestSnapshotPort,
  LatestSnapshotQuery,
  LatestSnapshotScope,
  PurgePrivateReceipt,
  ReplaceLatestReceipt,
  SealedPayload,
} from "../engram-live/snapshots.js";
import { analyzeCode, type RetainedObjectsPort } from "../engram-live/code-analysis.js";
import { buildVerifiedCaptureEvidence } from "../engram-live/factory-local.js";
import { allCurrent, type SourceVector } from "../engram-live/coverage.js";
import { Scheduler, scopeIdentity, type SchedulerBudgets, type WorkItem } from "../engram-live/scheduler.js";
import type { WatchEvent, WatchPort } from "../engram-live/watch.js";
import type {
  CollectOptions,
  DiscoveryLimits,
  DiscoveryPage,
  MarkerStore,
  PublishGenerationReport,
  PublishGenerationRequest,
  ReconcileScan,
  SourceValidationReport,
  WriterAuthority,
  WriterRequest,
} from "../engram-live/reconcile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const prFixturePath = join(root, "tests", "fixtures", "live-github-pages.json");

const DAY = 86_400_000;
const FIXTURE_NOW = 1_700_000_000_000 + 5 * DAY;

const sandboxes: LiveGitSandbox[] = [];
function createSandbox(): LiveGitSandbox {
  const box = new LiveGitSandbox();
  sandboxes.push(box);
  return box;
}
afterEach(() => {
  for (const box of sandboxes.splice(0)) box.dispose();
});

// — Hermetic streaming Git process port (mirrors tests/live-history.test.ts).
class TracedGitProcessPort implements GitProcessPort {
  readonly launches: { purpose: GitLaunch["purpose"]; cwd: string; args: string[] }[] = [];
  readonly tracePath: string;
  private static counter = 0;

  constructor(
    private readonly executable: string,
    private readonly envRoot: string,
    private readonly hooksDir: string,
  ) {
    TracedGitProcessPort.counter += 1;
    this.tracePath = join(envRoot, `factory-stream-trace2-${TracedGitProcessPort.counter}.jsonl`);
  }

  async start(launch: GitLaunch): Promise<GitProcess> {
    this.launches.push({ purpose: launch.purpose, cwd: launch.cwd, args: [...launch.args] });
    const child = spawn(this.executable, launch.args, {
      cwd: launch.cwd,
      env: {
        PATH: [dirname(this.executable), "/usr/bin", "/bin"].join(delimiter),
        HOME: this.hooksDir,
        XDG_CONFIG_HOME: this.hooksDir,
        TMPDIR: this.envRoot,
        LANG: "C",
        LC_ALL: "C",
        TZ: "UTC",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_ATTR_NOSYSTEM: "1",
        GIT_OPTIONAL_LOCKS: "0",
        GIT_NO_LAZY_FETCH: "1",
        GIT_NO_REPLACE_OBJECTS: "1",
        GIT_TERMINAL_PROMPT: "0",
        GIT_TRACE2_EVENT: this.tracePath,
      },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const exited = new Promise<GitProcessExit>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        resolve({ code: code ?? -1, stderr: Buffer.concat(stderr) });
      });
    });
    child.stdin.on("error", () => undefined);
    const chunks: Buffer[] = [];
    let ended = false;
    const wakeups: (() => void)[] = [];
    child.stdout.pause();
    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      child.stdout.pause();
      for (const wake of wakeups.splice(0)) wake();
    });
    const finish = (): void => {
      ended = true;
      for (const wake of wakeups.splice(0)) wake();
    };
    child.stdout.once("end", finish);
    child.stdout.once("close", finish);
    child.stdout.once("error", finish);
    const stdout = (async function* (): AsyncGenerator<Uint8Array> {
      for (;;) {
        while (chunks.length === 0 && !ended) {
          child.stdout.resume();
          await new Promise<void>((resolve) => wakeups.push(resolve));
        }
        if (chunks.length === 0) return;
        yield chunks.shift()!;
      }
    })();
    return {
      stdout,
      stdin: {
        async write(chunk: Uint8Array): Promise<void> {
          await new Promise<void>((resolve, reject) => {
            const onError = (error: Error): void => reject(error);
            child.stdin.once("error", onError);
            const settle = (): void => {
              child.stdin.removeListener("error", onError);
              resolve();
            };
            if (child.stdin.write(chunk)) settle();
            else child.stdin.once("drain", settle);
          });
        },
        async close(): Promise<void> {
          await new Promise<void>((resolve) => child.stdin.end(resolve));
        },
      },
      exit: exited,
      async abort(): Promise<void> {
        child.kill("SIGKILL");
        await exited.catch(() => undefined);
      },
    };
  }

  assertSafeTrace(): void {
    expect(existsSync(this.tracePath)).toBe(true);
    const events = readFileSync(this.tracePath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const children = events.filter((event) => event.event === "child_start");
    expect(children, `repository-triggered child program: ${JSON.stringify(children)}`).toEqual([]);
    expect(events.filter((event) => event.event === "start").length).toBe(this.launches.length);
    for (const launch of this.launches) {
      expect(launch.args).toContain("--no-optional-locks");
      expect(launch.args).toContain("core.fsmonitor=false");
      expect(launch.args).toContain(`core.hooksPath=${this.hooksDir}`);
      for (const arg of launch.args) {
        expect(arg).not.toMatch(/^--(max-count|since|until|first-parent)/);
      }
    }
  }
}

// — Traced synchronous spawn for SafeGitExecutor so we inspect every argv and
// assert zero child processes and exact host-injected core.hooksPath.
function createTracedGitSpawn(
  envRoot: string,
  hooksDir: string,
  tracePath: string,
): { spawn: GitSpawnFn; calls: { gitPath: string; argv: string[]; cwd: string }[] } {
  const calls: { gitPath: string; argv: string[]; cwd: string }[] = [];
  const spawnFn: GitSpawnFn = (gitPath, argv, options) => {
    calls.push({ gitPath, argv: [...argv], cwd: options.cwd });
    const baseEnv: NodeJS.ProcessEnv = {
      PATH: [dirname(gitPath), "/usr/bin", "/bin"].join(delimiter),
      HOME: hooksDir,
      XDG_CONFIG_HOME: hooksDir,
      TMPDIR: envRoot,
      LANG: "C",
      LC_ALL: "C",
      TZ: "UTC",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_ATTR_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_NO_LAZY_FETCH: "1",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_GRAFT_FILE: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      GIT_TRACE2_EVENT: tracePath,
    };
    const result = spawnSync(gitPath, [...argv], {
      cwd: options.cwd,
      ...(options.input !== undefined ? { input: options.input } : {}),
      env: options.env ? { ...baseEnv, ...options.env } : baseEnv,
      shell: false,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
      killSignal: "SIGKILL",
    });
    if (result.error) throw result.error;
    if (result.status === null) throw new Error(`git terminated by ${result.signal}`);
    return { status: result.status, stdout: result.stdout as Buffer, stderr: result.stderr as Buffer };
  };
  return { spawn: spawnFn, calls };
}

class MemoryHistoryPersistence implements HistoryPersistencePort {
  readonly facts = new Map<string, HistoryCommitFactDto>();
  readonly completion = new Map<string, HistoryCheckpointDto>();
  readonly retainedRoots = new Map<string, RetainedRootDto>();

  async loadCompletion(query: HistoryCompletionQuery): Promise<HistoryCompletionState> {
    const checkpoints = [...this.completion.values()].filter(
      (checkpoint) => checkpoint.cloneId === query.cloneId && checkpoint.algorithm === query.algorithm,
    );
    return {
      knownComplete: checkpoints.map((checkpoint) => checkpoint.oid),
      checkpoints: checkpoints.map((checkpoint) => ({ ...checkpoint, parents: [...checkpoint.parents] })),
      retainedRoots: [...this.retainedRoots.values()].filter(
        (rootEntry) => rootEntry.cloneId === query.cloneId && rootEntry.algorithm === query.algorithm,
      ),
    };
  }

  async persistCommitFact(fact: HistoryCommitFactDto): Promise<{ received: true }> {
    this.facts.set(`${fact.cloneId}:${fact.oid}`, fact);
    return { received: true };
  }

  async recordCompletion(checkpoint: HistoryCheckpointDto): Promise<{ received: true }> {
    this.completion.set(`${checkpoint.cloneId}:${checkpoint.oid}`, checkpoint);
    return { received: true };
  }

  async recordRetainedRoot(retained: RetainedRootDto): Promise<{ received: true }> {
    const key = `${retained.cloneId}:${retained.oid}`;
    if (!this.retainedRoots.has(key)) this.retainedRoots.set(key, retained);
    return { received: true };
  }
}

class FixtureGithubPrTransport implements GithubPrTransportPort {
  readonly requests: { cursor: string | null; etag: string | null; updatedAtSince: number | null }[] = [];
  constructor(private readonly pages: readonly PrPageDto[]) {}

  async fetchPage(request: { cursor: string | null; etag: string | null; updatedAtSince: number | null }): Promise<PrTransportResult> {
    this.requests.push({ cursor: request.cursor, etag: request.etag, updatedAtSince: request.updatedAtSince });
    const index = this.requests.length - 1;
    const served = this.pages[index];
    if (served === undefined) {
      return { ok: false, kind: "unavailable", message: `no fixture page at index ${index}` };
    }
    return { ok: true, page: { ...served, items: [...served.items] } };
  }
}

class MemoryPrPersistence implements PrSyncPersistencePort {
  cursor: PrSyncCursorDto | null = null;
  readonly observations = new Map<string, PullRequestFactDto>();
  readonly jobs = new Map<string, PrObjectJobDto>();

  async loadCursor(): Promise<PrSyncCursorDto | null> {
    return this.cursor;
  }

  async saveCursor(cursor: PrSyncCursorDto): Promise<void> {
    this.cursor = cursor;
  }

  async saveObservation(fact: PullRequestFactDto): Promise<void> {
    const key = observationIdentityKey(fact);
    if (!this.observations.has(key)) this.observations.set(key, fact);
  }

  async listObservations(): Promise<readonly PullRequestFactDto[]> {
    return [...this.observations.values()].sort((a, b) => a.number - b.number || a.updatedAt - b.updatedAt);
  }

  async recordObjectJob(job: PrObjectJobDto): Promise<void> {
    this.jobs.set(`${job.repositoryOwner}/${job.repositoryRepo}#${job.prNumber}@${job.headOid.algorithm}:${job.headOid.oid}`, job);
  }

  async updateObjectJob(job: PrObjectJobDto): Promise<void> {
    this.jobs.set(`${job.repositoryOwner}/${job.repositoryRepo}#${job.prNumber}@${job.headOid.algorithm}:${job.headOid.oid}`, job);
  }

  async listObjectJobs(): Promise<readonly PrObjectJobDto[]> {
    return [...this.jobs.values()];
  }
}

class MemoryRetentionPort implements RetentionPort {
  readonly requests = new Map<string, RetentionRequestDto>();
  readonly receipts = new Map<string, RetentionReceiptDto>();
  private key(scope: LiveScope, algorithm: QualifiedOid["algorithm"], oid: string): string {
    return `${scope.tenant}:${scope.clone}:${algorithm}:${oid}`;
  }

  async recordRequest(request: RetentionRequestDto): Promise<{ received: true }> {
    this.requests.set(this.key(request.scope, request.algorithm, request.oid), request);
    return { received: true };
  }

  async recordReceipt(receipt: RetentionReceiptDto): Promise<{ received: true }> {
    const checked = validateRetentionReceipt(receipt);
    if (!checked.ok) throw new Error(`invalid retention receipt: ${checked.errors.join("; ")}`);
    this.receipts.set(this.key(receipt.scope, receipt.algorithm, receipt.oid), receipt);
    return { received: true };
  }

  async loadReceipts(query: { scope: LiveScope; algorithm: QualifiedOid["algorithm"] }): Promise<{ receipts: readonly RetentionReceiptDto[] }> {
    return {
      receipts: [...this.receipts.values()].filter(
        (receipt) =>
          receipt.scope.tenant === query.scope.tenant &&
          receipt.scope.clone === query.scope.clone &&
          receipt.algorithm === query.algorithm,
      ),
    };
  }
}

interface RecordedDelivery {
  readonly batch: FactBatchDto;
  readonly fencingToken: ScopeFencingTokenDto;
  readonly receipt: FactSinkReceipt;
}

class FakeFencedSink implements FactSinkPort {
  readonly deliveries: RecordedDelivery[] = [];
  refuseWith?: Error;
  malformedReceipt?: FactSinkReceipt;

  async deliver(batch: FactBatchDto, fencingToken: ScopeFencingTokenDto): Promise<FactSinkReceipt> {
    if (this.refuseWith !== undefined) throw this.refuseWith;
    if (this.malformedReceipt !== undefined) return this.malformedReceipt;
    const receipt: FactSinkReceipt = {
      received: true,
      batchId: batch.batchId,
      receiptId: `rcpt:${String(this.deliveries.length + 1).padStart(6, "0")}`,
    };
    this.deliveries.push({ batch, fencingToken, receipt });
    return receipt;
  }
}

function loadP1Fixture(): { repository: GithubRepositoryDto; pages: PrPageDto[] } {
  const raw = JSON.parse(readFileSync(prFixturePath, "utf8")) as {
    repository: { owner: string; repo: string };
    pages: {
      cursor: string | null;
      items: {
        number: number;
        state: "open" | "closed" | "merged";
        isDraft: boolean;
        updatedAt: number;
        headOid: string;
        headRef: string;
        baseOid: string;
        baseRef: string;
      }[];
      nextCursor: string | null;
      hasMore: boolean;
      endProof?: "end-of-list";
    }[];
  };
  const repository: GithubRepositoryDto = { owner: raw.repository.owner, repo: raw.repository.repo };
  const pages: PrPageDto[] = raw.pages.map((page) => ({
    items: page.items.map((item) => ({
      repositoryOwner: repository.owner,
      repositoryRepo: repository.repo,
      number: item.number,
      state: item.state,
      isDraft: item.isDraft,
      updatedAt: item.updatedAt,
      headOid: { algorithm: "sha1", oid: item.headOid },
      headRef: item.headRef,
      baseOid: { algorithm: "sha1", oid: item.baseOid },
      baseRef: item.baseRef,
    })),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    ...(page.endProof !== undefined ? { endProof: page.endProof } : {}),
  }));
  return { repository, pages };
}

function buildL0Setup(box: LiveGitSandbox) {
  const capabilities = detectGitCapabilities(box);
  const format = capabilities.objectFormats.includes("sha1") ? ("sha1" as const) : capabilities.objectFormats[0]!;
  const corpus = buildCorpus(box, format, "files");
  const commonDir = realpathSync(join(corpus.repo, ".git"));
  const mainGitDir = box.git(corpus.repo, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
  const detachedGitDir = box.git(corpus.detached, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
  const repository = observeRepository({
    hostScope: "host:easm2-factory",
    commonDirRealpath: commonDir,
    commonDirProjectFingerprint: "ws:easm2-corpus",
    oidAlgorithm: format,
    worktrees: [
      {
        worktreePath: corpus.repo,
        gitDir: mainGitDir,
        worktreeFingerprint: "wtfp:main",
        head: { kind: "branch", refName: "refs/heads/main" },
      },
      {
        worktreePath: corpus.detached,
        gitDir: detachedGitDir,
        worktreeFingerprint: "wtfp:detached",
        head: { kind: "detached", oid: corpus.commits.merge },
      },
    ],
  });
  const mainWorktree = repository.worktrees[0]!.identity;
  const declIdentity = deriveDeclarationIdentity({
    hostScope: "host:easm2-factory",
    clone: repository.clone,
    worktree: mainWorktree,
  });
  const declaration: WorkspaceDeclarationDto = {
    tenant: "local:easm2-owner",
    principal: "local:easm2-principal",
    hostFingerprint: "hostfp:easm2",
    identityUncertainty: [],
    declarationId: declIdentity.declarationId,
    cloneId: repository.clone.cloneId,
    worktreeId: mainWorktree.worktreeId,
    authorizedRoots: [corpus.root],
    liveCapability: "live",
    policyVersion: POLICY_VERSION,
    declarationRevision: 1,
  };
  const cloneScope: LiveScope = { tenant: declaration.tenant, clone: declaration.cloneId };
  const fencingToken: ScopeFencingTokenDto = {
    tokenId: "tok:easm2-clone-001",
    scope: cloneScope,
    epoch: 1,
    epochId: "epoch:001",
    declarationRevision: declaration.declarationRevision,
    projectionIncarnation: "inc:easm2-001",
    issuedAt: FIXTURE_NOW - 10_000,
    expiresAt: FIXTURE_NOW + 60_000,
  };
  const hooksDir = join(box.root, "disabled-hooks");
  return { format, corpus, repository, declaration, cloneScope, fencingToken, hooksDir };
}

function makeNoopAuxPorts(): Pick<LiveFactoryPorts, "filesystem" | "clock" | "grammarRuntime"> {
  return {
    filesystem: {
      async readFileBytes(path: string): Promise<Uint8Array> {
        throw new Error(`unexpected filesystem read: ${path}`);
      },
    },
    clock: { now: () => FIXTURE_NOW },
    grammarRuntime: {
      init() {},
      async loadLanguage(): Promise<object> {
        throw new Error("unexpected grammar load");
      },
      createParser() {
        throw new Error("unexpected parser creation");
      },
    },
  };
}

describe("E-ASM2 committed-history capabilities behind the factory", () => {
  it("refs history-dag github-pr and retention-requests execute through the factory on L0 fixtures and deliver typed fenced batches to a fake sink", async () => {
    const box = createSandbox();
    const { corpus, repository, declaration, cloneScope, fencingToken, hooksDir } = buildL0Setup(box);
    const digestBefore = inventoryDigest(corpus);

    const syncTracePath = join(box.root, "factory-sync-trace2.jsonl");
    const syncSpawn = createTracedGitSpawn(box.root, hooksDir, syncTracePath);
    const streamPort = new TracedGitProcessPort(box.trace.executable, box.root, hooksDir);
    const sink = new FakeFencedSink();
    const historyPersistence = new MemoryHistoryPersistence();
    const { repository: ghRepo, pages } = loadP1Fixture();
    const prTransport = new FixtureGithubPrTransport(pages);
    const prPersistence = new MemoryPrPersistence();
    const retentionPort = new MemoryRetentionPort();

    const gitPort: GitPort = {
      gitPath: box.trace.executable,
      disabledHooksDir: hooksDir,
      spawn: syncSpawn.spawn,
      process: streamPort,
    };

    const factory = createLiveFactory({
      declaration,
      ports: {
        ...makeNoopAuxPorts(),
        git: gitPort,
        factSink: sink,
        historyPersistence,
        githubPr: prTransport,
        prPersistence,
        retention: retentionPort,
      },
    });

    // Single source of capability status: all 10 capabilities available (E-ASM3).
    expect(factory.describeCapabilities()).toEqual(describeCapabilities());
    const availableIds = factory
      .describeCapabilities()
      .filter((entry) => entry.state === "available")
      .map((entry) => entry.capability);
    expect(availableIds).toEqual([...CAPABILITY_IDS]);

    // 1. refs capability on real L0 corpus through SafeGitExecutor.
    const refsGenId = formatProducerGenerationId(1);
    const refsResult = await factory.runCapability("refs", {
      cwd: corpus.repo,
      defaultBranch: "refs/heads/main",
      generationId: refsGenId,
      fencingToken,
      expectedIncarnation: fencingToken.projectionIncarnation,
    });
    expect(refsResult.state).toBe("available");
    expect(refsResult.delivered).toBe(true);
    if (refsResult.state !== "available" || refsResult.capability !== "refs") {
      throw new Error(`expected available refs result, got ${JSON.stringify(refsResult)}`);
    }
    expect(refsResult.trackedRefs.length).toBeGreaterThanOrEqual(4);
    expect(refsResult.roots.length).toBeGreaterThanOrEqual(2);
    expect(refsResult.batches.length).toBeGreaterThan(0);

    const refsDeliveries = sink.deliveries.slice();
    expect(refsDeliveries.length).toBe(refsResult.batches.length);
    const refsFacts = refsDeliveries.flatMap((entry) => entry.batch.facts);
    const refsKinds = new Set(refsFacts.map((fact) => classifyLiveFactKind(fact)));
    expect(refsKinds.has("ref-observation")).toBe(true);
    expect(refsKinds.has("ref-state")).toBe(true);
    expect(refsKinds.has("coverage")).toBe(true);

    // 2. history-dag capability on real L0 corpus through streamGitHistory / runHistoryPass.
    const historyStartIdx = sink.deliveries.length;
    const historyGenId = formatProducerGenerationId(2);
    const historyResult = await factory.runCapability("history-dag", {
      cwd: corpus.repo,
      repository,
      defaultBranch: "refs/heads/main",
      generationId: historyGenId,
      fencingToken,
      expectedIncarnation: fencingToken.projectionIncarnation,
    });
    expect(historyResult.state).toBe("available");
    expect(historyResult.delivered).toBe(true);
    if (historyResult.state !== "available" || historyResult.capability !== "history-dag") {
      throw new Error(`expected available history-dag result, got ${JSON.stringify(historyResult)}`);
    }
    expect(historyResult.outcome.state).toBe("complete");
    expect(historyResult.outcome.stats.commitsExtracted).toBeGreaterThanOrEqual(6);
    expect(historyResult.batches.length).toBeGreaterThan(0);

    const historyDeliveries = sink.deliveries.slice(historyStartIdx);
    const historyFacts = historyDeliveries.flatMap((entry) => entry.batch.facts);
    const historyKinds = new Set(historyFacts.map((fact) => classifyLiveFactKind(fact)));
    expect(historyKinds.has("commit")).toBe(true);
    expect(historyKinds.has("changed-file")).toBe(true);
    expect(historyKinds.has("progress")).toBe(true);
    expect(historyKinds.has("coverage")).toBe(true);
    // Ordered merge parents preserved on the L0 merge commit.
    const mergeFact = historyFacts.find(
      (fact) => "kind" in fact && fact.kind === "commit" && fact.commit.oid === corpus.commits.merge,
    );
    expect(mergeFact).toBeDefined();
    if (mergeFact && "kind" in mergeFact && mergeFact.kind === "commit") {
      expect(mergeFact.parents.map((p) => p.oid)).toEqual([corpus.commits.left, corpus.commits.right]);
    }
    // Rename commit normalized cleanly to single-letter status "R" with score 100.
    const renameFact = historyFacts.find(
      (fact) => "kind" in fact && fact.kind === "changed-file" && fact.status === "R",
    );
    expect(renameFact).toBeDefined();
    if (renameFact && "kind" in renameFact && renameFact.kind === "changed-file") {
      expect(renameFact.statusScore).toBe(100);
    }

    // Incremental no-change re-run extracts 0 already complete commits.
    const historyIncResult = await factory.runCapability("history-dag", {
      cwd: corpus.repo,
      repository,
      defaultBranch: "refs/heads/main",
      generationId: formatProducerGenerationId(3),
      fencingToken,
      expectedIncarnation: fencingToken.projectionIncarnation,
    });
    expect(historyIncResult.state).toBe("available");
    if (historyIncResult.state === "available" && historyIncResult.capability === "history-dag") {
      expect(historyIncResult.outcome.stats.commitsExtracted).toBe(0);
      expect(historyIncResult.outcome.stats.commitsSkippedComplete).toBeGreaterThanOrEqual(6);
    }

    // 3. github-pr capability on P1 fixture pages (>30 PRs, all states + pinned attribution)
    // with a tight maxBatchBytes bound proving multi-batch canonical chunking.
    const prStartIdx = sink.deliveries.length;
    const prGenId = formatProducerGenerationId(4);
    const samplePr = pages[0]!.items[0]!;
    const prResult = await factory.runCapability("github-pr", {
      repository: ghRepo,
      sweepKind: "full",
      generationId: prGenId,
      fencingToken,
      expectedIncarnation: fencingToken.projectionIncarnation,
      maxBatchBytes: 8192,
      attributions: [
        {
          repositoryOwner: ghRepo.owner,
          repositoryRepo: ghRepo.repo,
          prNumber: samplePr.number,
          baseOid: samplePr.baseOid,
          headOid: samplePr.headOid,
          mergeBaseOids: [samplePr.baseOid],
          mergeStrategy: "merge",
        },
      ],
    });
    expect(prResult.state).toBe("available");
    expect(prResult.delivered).toBe(true);
    if (prResult.state !== "available" || prResult.capability !== "github-pr") {
      throw new Error(`expected available github-pr result, got ${JSON.stringify(prResult)}`);
    }
    expect(prResult.outcome.state).toBe("complete");
    expect(prResult.outcome.observations).toHaveLength(36);
    expect(prResult.outcome.stats.unique).toBe(35);
    expect(prResult.attributions).toHaveLength(1);
    expect(prResult.attributions[0]!.status).toBe("complete");
    expect(prTransport.requests).toHaveLength(3);
    expect(prResult.batches.length).toBeGreaterThanOrEqual(2);
    for (const summary of prResult.batches) {
      expect(summary.byteLength).toBeLessThanOrEqual(8192);
    }

    const prDeliveries = sink.deliveries.slice(prStartIdx);
    const prFacts = prDeliveries.flatMap((entry) => entry.batch.facts);
    const prKinds = new Set(prFacts.map((fact) => classifyLiveFactKind(fact)));
    expect(prKinds.has("pr-observation")).toBe(true);
    expect(prKinds.has("pr-attribution")).toBe(true);
    expect(prKinds.has("progress")).toBe(true);
    expect(prKinds.has("coverage")).toBe(true);
    expect(prFacts.filter((fact) => "kind" in fact && fact.kind === "pr-observation")).toHaveLength(36);

    // 4. retention-requests capability: first with missing receipts (explicit gaps),
    // then after host records durable receipts (complete + typed retention-receipt facts).
    const retGapStartIdx = sink.deliveries.length;
    const retGapResult = await factory.runCapability("retention-requests", {
      roots: historyResult.outcome.roots,
      generationId: formatProducerGenerationId(5),
      fencingToken,
      expectedIncarnation: fencingToken.projectionIncarnation,
    });
    expect(retGapResult.state).toBe("available");
    expect(retGapResult.delivered).toBe(true);
    if (retGapResult.state !== "available" || retGapResult.capability !== "retention-requests") {
      throw new Error(`expected available retention-requests result, got ${JSON.stringify(retGapResult)}`);
    }
    expect(retGapResult.outcome.state).toBe("gaps");
    expect(retGapResult.outcome.stats.requests).toBe(historyResult.outcome.roots.length);
    expect(retGapResult.outcome.stats.missing).toBe(historyResult.outcome.roots.length);
    expect(retGapResult.receipts).toHaveLength(0);
    const gapFacts = sink.deliveries.slice(retGapStartIdx).flatMap((entry) => entry.batch.facts);
    expect(
      gapFacts.some(
        (fact) => "kind" in fact && fact.kind === "coverage" && fact.axis === "object-availability" && fact.state === "unavailable",
      ),
    ).toBe(true);

    // Record scoped durable receipts in the host retention port and re-run.
    for (const req of retGapResult.outcome.requests) {
      await retentionPort.recordReceipt({
        scope: cloneScope,
        algorithm: req.algorithm,
        oid: req.oid,
        receivedAt: FIXTURE_NOW + 100,
        backupRef: `backup:${createHash("sha256").update(req.oid).digest("hex").slice(0, 16)}`,
      });
    }
    const retDoneStartIdx = sink.deliveries.length;
    const retDoneResult = await factory.runCapability("retention-requests", {
      roots: historyResult.outcome.roots,
      generationId: formatProducerGenerationId(6),
      fencingToken,
      expectedIncarnation: fencingToken.projectionIncarnation,
    });
    expect(retDoneResult.state).toBe("available");
    expect(retDoneResult.delivered).toBe(true);
    if (retDoneResult.state !== "available" || retDoneResult.capability !== "retention-requests") {
      throw new Error(`expected complete retention-requests result, got ${JSON.stringify(retDoneResult)}`);
    }
    expect(retDoneResult.outcome.state).toBe("complete");
    expect(retDoneResult.outcome.stats.missing).toBe(0);
    expect(retDoneResult.receipts).toHaveLength(historyResult.outcome.roots.length);
    const doneFacts = sink.deliveries.slice(retDoneStartIdx).flatMap((entry) => entry.batch.facts);
    expect(doneFacts.filter((fact) => "kind" in fact && fact.kind === "retention-receipt")).toHaveLength(
      historyResult.outcome.roots.length,
    );

    // Every delivered batch across all 4 capabilities is typed, canonically encoded,
    // digest-verified, clone-scoped, and carried the exact clone-scoped fencing token.
    expect(sink.deliveries.length).toBeGreaterThanOrEqual(6);
    for (const delivery of sink.deliveries) {
      expect(delivery.batch.producerName).toBe(PRODUCER_NAME);
      expect(delivery.batch.contractVersion).toBe(CONTRACT_VERSION);
      expect(delivery.batch.policyVersion).toBe(POLICY_VERSION);
      expect(delivery.batch.scope).toEqual(cloneScope);
      expect(delivery.batch.scope.worktree).toBeUndefined();
      expect(validateFactBatch(delivery.batch)).toEqual({ ok: true, errors: [] });
      expect(factory.validateBatch(delivery.batch)).toEqual({ ok: true, errors: [] });
      const encoded = encodeFactBatch(delivery.batch);
      expect(encoded.batchDigest).toBe(delivery.batch.batchDigest);
      const decoded = decodeFactBatch(encoded.bytes);
      expect(decoded.batchDigest).toBe(delivery.batch.batchDigest);
      expect(delivery.fencingToken).toEqual(fencingToken);
      expect(delivery.fencingToken.scope.worktree).toBeUndefined();
    }

    // Whole-worktree immutability and safe Git process traces.
    expect(inventoryDigest(corpus)).toBe(digestBefore);
    streamPort.assertSafeTrace();
    expect(syncSpawn.calls.length).toBeGreaterThan(0);
    for (const call of syncSpawn.calls) {
      expect(call.argv).toContain(`core.hooksPath=${hooksDir}`);
      expect(call.argv).toContain("--no-optional-locks");
    }
    const syncTraceEvents = readFileSync(syncTracePath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(syncTraceEvents.filter((event) => event.event === "child_start")).toEqual([]);
  });

  it("a missing or refusing port makes its capability explicitly unavailable and never an empty success", async () => {
    const box = createSandbox();
    const { corpus, repository, declaration, cloneScope, fencingToken, hooksDir } = buildL0Setup(box);
    const { repository: ghRepo, pages } = loadP1Fixture();
    const rootOid = corpus.commits.merge;
    const selectedRoots = [
      {
        qualifiedOid: { algorithm: repository.clone.oidAlgorithm, oid: rootOid },
        rev: rootOid,
        sources: [{ signal: "default-branch" as const, refName: "refs/heads/main", worktreeId: null, activityAt: FIXTURE_NOW, generation: 1 }],
      },
    ];

    const validGit: GitPort = {
      gitPath: box.trace.executable,
      disabledHooksDir: hooksDir,
      process: new TracedGitProcessPort(box.trace.executable, box.root, hooksDir),
    };
    const makeBasePorts = (sink: FakeFencedSink): LiveFactoryPorts => ({
      ...makeNoopAuxPorts(),
      git: validGit,
      factSink: sink,
      historyPersistence: new MemoryHistoryPersistence(),
      githubPr: new FixtureGithubPrTransport(pages),
      prPersistence: new MemoryPrPersistence(),
      retention: new MemoryRetentionPort(),
    });

    const refsReq = { cwd: corpus.repo, defaultBranch: "refs/heads/main", generationId: formatProducerGenerationId(10), fencingToken };
    const historyReq = { cwd: corpus.repo, repository, defaultBranch: "refs/heads/main", generationId: formatProducerGenerationId(11), fencingToken };
    const prReq = { repository: ghRepo, sweepKind: "full" as const, generationId: formatProducerGenerationId(12), fencingToken };
    const retReq = { roots: selectedRoots, generationId: formatProducerGenerationId(13), fencingToken };

    // 1. Missing ports — each affected capability returns explicit unavailable with 0 sink writes.
    {
      const sink = new FakeFencedSink();
      const noGit = createLiveFactory({ declaration, ports: { ...makeBasePorts(sink), git: undefined } });
      const r1 = await noGit.runCapability("refs", refsReq);
      const r2 = await noGit.runCapability("history-dag", historyReq);
      expect(r1).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
      expect(r1.reason.length).toBeGreaterThan(0);
      expect(r2).toMatchObject({ capability: "history-dag", state: "unavailable", delivered: false });
      expect(r2.reason.length).toBeGreaterThan(0);
      expect(sink.deliveries).toHaveLength(0);
    }
    {
      const sink = new FakeFencedSink();
      const noStream = createLiveFactory({
        declaration,
        ports: { ...makeBasePorts(sink), git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir } },
      });
      const r = await noStream.runCapability("history-dag", historyReq);
      expect(r).toMatchObject({ capability: "history-dag", state: "unavailable", delivered: false });
      expect(r.reason).toMatch(/stream|process/i);
      expect(sink.deliveries).toHaveLength(0);
    }
    {
      const sink = new FakeFencedSink();
      const noHistoryPersist = createLiveFactory({ declaration, ports: { ...makeBasePorts(sink), historyPersistence: undefined } });
      const r = await noHistoryPersist.runCapability("history-dag", historyReq);
      expect(r).toMatchObject({ capability: "history-dag", state: "unavailable", delivered: false });
      expect(r.reason).toMatch(/persistence/i);
      expect(sink.deliveries).toHaveLength(0);
    }
    {
      const sink = new FakeFencedSink();
      const noPrTransport = createLiveFactory({ declaration, ports: { ...makeBasePorts(sink), githubPr: undefined } });
      const r1 = await noPrTransport.runCapability("github-pr", prReq);
      expect(r1).toMatchObject({ capability: "github-pr", state: "unavailable", delivered: false });
      expect(r1.reason).toMatch(/github|transport/i);
      const noPrPersist = createLiveFactory({ declaration, ports: { ...makeBasePorts(sink), prPersistence: undefined } });
      const r2 = await noPrPersist.runCapability("github-pr", prReq);
      expect(r2).toMatchObject({ capability: "github-pr", state: "unavailable", delivered: false });
      expect(r2.reason).toMatch(/persistence/i);
      expect(sink.deliveries).toHaveLength(0);
    }
    {
      const sink = new FakeFencedSink();
      const noRetention = createLiveFactory({ declaration, ports: { ...makeBasePorts(sink), retention: undefined } });
      const r = await noRetention.runCapability("retention-requests", retReq);
      expect(r).toMatchObject({ capability: "retention-requests", state: "unavailable", delivered: false });
      expect(r.reason).toMatch(/retention/i);
      expect(sink.deliveries).toHaveLength(0);
    }
    {
      for (const malformedSink of [undefined, {}] as unknown as FactSinkPort[]) {
        const noSink = createLiveFactory({
          declaration,
          ports: { ...makeBasePorts(new FakeFencedSink()), factSink: malformedSink },
        });
        for (const [cap, req] of [
          ["refs", refsReq],
          ["history-dag", historyReq],
          ["github-pr", prReq],
          ["retention-requests", retReq],
        ] as const) {
          const r = await noSink.runCapability(cap, req as never);
          expect(r).toMatchObject({ capability: cap, state: "unavailable", delivered: false });
          expect(r.reason).toMatch(/missing host fact sink port/i);
        }
      }
    }

    // 2. Omitted request never reports available without executing its engine.
    {
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({ declaration, ports: makeBasePorts(sink) });
      for (const cap of ["refs", "history-dag", "github-pr", "retention-requests"] as const) {
        const r = await factory.runCapability(cap);
        expect(r).toMatchObject({ capability: cap, state: "unavailable", delivered: false });
        expect(r.reason.length).toBeGreaterThan(0);
      }
      expect(sink.deliveries).toHaveLength(0);
    }

    // 3. Missing, expired, foreign-clone or worktree-bound fencing token is refused with 0 sink writes.
    {
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({ declaration, ports: makeBasePorts(sink) });
      const badTokens: ScopeFencingTokenDto[] = [
        { ...fencingToken, expiresAt: FIXTURE_NOW - 1 },
        { ...fencingToken, scope: { tenant: cloneScope.tenant, clone: "clone:foreign" } },
        { ...fencingToken, scope: { ...cloneScope, worktree: declaration.worktreeId } },
        { ...fencingToken, declarationRevision: declaration.declarationRevision + 1 },
      ];
      for (const badToken of badTokens) {
        const r = await factory.runCapability("retention-requests", { ...retReq, fencingToken: badToken });
        expect(r).toMatchObject({ capability: "retention-requests", state: "unavailable", delivered: false });
        expect(r.reason).toMatch(/fencing|token/i);
      }
      expect(sink.deliveries).toHaveLength(0);
    }

    // 4. Refusing ports — throwing or returning auth/unavailable failures never produce an empty success.
    {
      const sink = new FakeFencedSink();
      const refusingGit = createLiveFactory({
        declaration,
        ports: {
          ...makeBasePorts(sink),
          git: {
            gitPath: box.trace.executable,
            disabledHooksDir: hooksDir,
            spawn: () => {
              throw new Error("EACCES: host refused git spawn");
            },
            process: {
              async start(): Promise<GitProcess> {
                throw new Error("EACCES: host refused git stream");
              },
            },
          },
        },
      });
      const r1 = await refusingGit.runCapability("refs", refsReq);
      const r2 = await refusingGit.runCapability("history-dag", historyReq);
      expect(r1).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
      expect(r2).toMatchObject({ capability: "history-dag", state: "unavailable", delivered: false });
      expect(sink.deliveries).toHaveLength(0);
    }
    {
      const sink = new FakeFencedSink();
      const refusingAuthPr = createLiveFactory({
        declaration,
        ports: {
          ...makeBasePorts(sink),
          githubPr: {
            async fetchPage(): Promise<PrTransportResult> {
              return { ok: false, kind: "auth_required", message: "gh authentication revoked" };
            },
          },
        },
      });
      const r1 = await refusingAuthPr.runCapability("github-pr", prReq);
      expect(r1).toMatchObject({ capability: "github-pr", state: "unavailable", delivered: false });
      expect(r1.reason).toMatch(/auth_required|revoked/i);

      const throwingPr = createLiveFactory({
        declaration,
        ports: {
          ...makeBasePorts(sink),
          githubPr: {
            async fetchPage(): Promise<PrTransportResult> {
              throw new Error("transport refused by policy");
            },
          },
        },
      });
      const r2 = await throwingPr.runCapability("github-pr", prReq);
      expect(r2).toMatchObject({ capability: "github-pr", state: "unavailable", delivered: false });
      expect(r2.reason).toMatch(/offline|refused/i);
      expect(sink.deliveries).toHaveLength(0);
    }
    {
      const sink = new FakeFencedSink();
      const refusingRetention = createLiveFactory({
        declaration,
        ports: {
          ...makeBasePorts(sink),
          retention: {
            async recordRequest() {
              throw new Error("private object store quota refused");
            },
            async recordReceipt() {
              throw new Error("private object store quota refused");
            },
            async loadReceipts() {
              throw new Error("private object store quota refused");
            },
          },
        },
      });
      const r = await refusingRetention.runCapability("retention-requests", retReq);
      expect(r).toMatchObject({ capability: "retention-requests", state: "unavailable", delivered: false });
      expect(r.reason).toMatch(/refused|quota/i);
      expect(sink.deliveries).toHaveLength(0);
    }
    {
      const sink = new FakeFencedSink();
      sink.refuseWith = new Error("fencing token revoked at storage lease check");
      const refusingSinkFactory = createLiveFactory({ declaration, ports: makeBasePorts(sink) });
      for (const [cap, req] of [
        ["refs", refsReq],
        ["history-dag", historyReq],
        ["github-pr", prReq],
        ["retention-requests", retReq],
      ] as const) {
        const r = await refusingSinkFactory.runCapability(cap, req as never);
        expect(r).toMatchObject({ capability: cap, state: "unavailable", delivered: false });
        expect(r.reason).toMatch(/sink|revoked/i);
      }
      expect(sink.deliveries).toHaveLength(0);
    }
  });

  it("the factory composes no Git executor without a host-injected hooks-isolation directory and creates nothing under the OS temporary directory", async () => {
    const box = createSandbox();
    const { corpus, repository, declaration, fencingToken, hooksDir } = buildL0Setup(box);

    // Prepare invalid hooks-isolation directory candidates:
    // omitted, empty, whitespace, relative, bare OS tmpdir, inside source root,
    // non-existent directory, non-empty directory, and symlink.
    const nonEmptyDir = join(box.root, "non-empty-hooks");
    mkdirSync(nonEmptyDir);
    writeFileSync(join(nonEmptyDir, "post-commit"), "#!/bin/sh\nexit 0\n");
    const symlinkDir = join(box.root, "symlink-hooks");
    symlinkSync(hooksDir, symlinkDir);
    const inSourceRoot = join(corpus.repo, ".git", "hooks");

    const invalidCandidates: Array<[string, unknown]> = [
      ["undefined", undefined],
      ["empty string", ""],
      ["whitespace", "   "],
      ["relative path", "disabled-hooks"],
      ["OS tmpdir", tmpdir()],
      ["source root", corpus.repo],
      ["inside source root", inSourceRoot],
      ["missing directory", join(box.root, "does-not-exist-hooks")],
      ["non-empty directory", nonEmptyDir],
      ["symlink directory", symlinkDir],
    ];

    for (const [label, badHooksDir] of invalidCandidates) {
      let spawnCount = 0;
      let streamCount = 0;
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: {
            gitPath: box.trace.executable,
            disabledHooksDir: badHooksDir as string,
            spawn: () => {
              spawnCount += 1;
              throw new Error(`spawn must not run for invalid hooks dir (${label})`);
            },
            process: {
              async start(): Promise<GitProcess> {
                streamCount += 1;
                throw new Error(`stream must not run for invalid hooks dir (${label})`);
              },
            },
          },
          factSink: sink,
          historyPersistence: new MemoryHistoryPersistence(),
        },
      });

      const refsRes = await factory.runCapability("refs", {
        cwd: corpus.repo,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(20),
        fencingToken,
      });
      expect(refsRes, `refs must refuse invalid hooks dir (${label})`).toMatchObject({
        capability: "refs",
        state: "unavailable",
        delivered: false,
      });
      expect(refsRes.reason, `refs reason for ${label}`).toMatch(/hooks-isolation|disabledHooksDir/i);

      const histRes = await factory.runCapability("history-dag", {
        cwd: corpus.repo,
        repository,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(21),
        fencingToken,
      });
      expect(histRes, `history-dag must refuse invalid hooks dir (${label})`).toMatchObject({
        capability: "history-dag",
        state: "unavailable",
        delivered: false,
      });
      expect(histRes.reason, `history-dag reason for ${label}`).toMatch(/hooks-isolation|disabledHooksDir/i);

      expect(spawnCount, `no sync Git spawn may occur for ${label}`).toBe(0);
      expect(streamCount, `no stream Git launch may occur for ${label}`).toBe(0);
      expect(sink.deliveries, `no sink write may occur for ${label}`).toHaveLength(0);
    }

    // Isolated OS-temporary-directory probe (plan/09 L9-E / E-ASM2 method):
    // run both the missing-hooks refusal AND a valid host-injected refs +
    // history-dag cycle in a child process whose TMPDIR points at an empty
    // sandbox directory, and verify ZERO files or directories are created there
    // (no `engram-live-no-hooks-*` fallback, no temp leakage).
    const isolatedTmp = join(box.root, "isolated-os-tmp");
    mkdirSync(isolatedTmp);
    const probeScript = join(box.root, "hooks-tmpdir-probe.mjs");
    writeFileSync(
      probeScript,
      String.raw`
        import assert from "node:assert/strict";
        import { readdirSync } from "node:fs";
        import { tmpdir } from "node:os";
        import { pathToFileURL } from "node:url";

        const [integrationUrl, dataJson] = process.argv.slice(2);
        const data = JSON.parse(dataJson);
        assert.equal(tmpdir(), data.isolatedTmp, "child TMPDIR must resolve to isolated probe dir");
        const integration = await import(pathToFileURL(integrationUrl).href);

        const basePorts = {
          filesystem: { async readFileBytes() { throw new Error("unused"); } },
          clock: { now: () => data.now },
          grammarRuntime: { init() {}, async loadLanguage() { throw new Error("unused"); }, createParser() { throw new Error("unused"); } },
          factSink: { async deliver(batch) { return { received: true, batchId: batch.batchId }; } },
        };

        // 1. Missing disabledHooksDir: must refuse and create nothing in tmpdir().
        const noHooksFactory = integration.createLiveFactory({
          declaration: data.declaration,
          ports: { ...basePorts, git: { gitPath: data.gitPath } },
        });
        const refused = await noHooksFactory.runCapability("refs", {
          cwd: data.repo,
          defaultBranch: "refs/heads/main",
          generationId: "gen:0000000030",
          fencingToken: data.fencingToken,
        });
        assert.equal(refused.state, "unavailable");
        assert.equal(refused.delivered, false);
        assert.deepEqual(readdirSync(tmpdir()), [], "refused call must create nothing under OS tmpdir");

        // 2. Host-injected disabledHooksDir: executes refs cleanly and creates nothing in tmpdir().
        const validFactory = integration.createLiveFactory({
          declaration: data.declaration,
          ports: { ...basePorts, git: { gitPath: data.gitPath, disabledHooksDir: data.hooksDir } },
        });
        const ok = await validFactory.runCapability("refs", {
          cwd: data.repo,
          defaultBranch: "refs/heads/main",
          generationId: "gen:0000000031",
          fencingToken: data.fencingToken,
        });
        assert.equal(ok.state, "available", JSON.stringify(ok));
        assert.equal(ok.delivered, true);
        assert.ok(ok.trackedRefs.length >= 4);
        assert.deepEqual(readdirSync(tmpdir()), [], "valid factory call must create nothing under OS tmpdir");
        console.log(JSON.stringify({ refused: refused.state, ok: ok.state, tmpEntries: readdirSync(tmpdir()) }));
      `,
    );

    // Ensure built dist/integration.js is fresh for the node ESM child probe.
    const distIntegration = join(root, "engram-live", "dist", "integration.js");
    const distFactoryHistory = join(root, "engram-live", "dist", "factory-history.js");
    const distFactoryLocal = join(root, "engram-live", "dist", "factory-local.js");
    const srcNewest = Math.max(
      statSync(join(root, "engram-live", "contracts.ts")).mtimeMs,
      statSync(join(root, "engram-live", "integration.ts")).mtimeMs,
      statSync(join(root, "engram-live", "factory-history.ts")).mtimeMs,
      statSync(join(root, "engram-live", "factory-local.ts")).mtimeMs,
    );
    const needBuild =
      !existsSync(distIntegration) ||
      !existsSync(distFactoryHistory) ||
      !existsSync(distFactoryLocal) ||
      statSync(distIntegration).mtimeMs < srcNewest ||
      statSync(distFactoryHistory).mtimeMs < srcNewest ||
      statSync(distFactoryLocal).mtimeMs < srcNewest;
    if (needBuild) {
      const lockPath = join(tmpdir(), "engram-live-build.lock");
      for (let attempt = 0; ; attempt += 1) {
        let fd: number | undefined;
        try {
          fd = openSync(lockPath, "wx");
        } catch {
          try {
            if (statSync(lockPath).mtimeMs < Date.now() - 180_000) unlinkSync(lockPath);
          } catch {
            continue;
          }
          if (attempt > 900) throw new Error("engram-live build lock is stuck");
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
          continue;
        }
        try {
          execFileSync(process.execPath, [join(root, "scripts", "build-live.mjs")], { cwd: root, stdio: "inherit" });
          break;
        } finally {
          try {
            if (fd !== undefined) closeSync(fd);
          } catch {
            /* ignore */
          }
          try {
            unlinkSync(lockPath);
          } catch {
            /* ignore */
          }
        }
      }
    }
    const runProbe = spawnSync(
      process.execPath,
      [
        probeScript,
        distIntegration,
        JSON.stringify({
          isolatedTmp,
          declaration,
          fencingToken,
          gitPath: box.trace.executable,
          hooksDir,
          repo: corpus.repo,
          now: FIXTURE_NOW,
        }),
      ],
      {
        cwd: box.root,
        env: { ...process.env, TMPDIR: isolatedTmp, TMP: isolatedTmp, TEMP: isolatedTmp },
        encoding: "utf8",
      },
    );
    expect(runProbe.status, `isolated tmpdir probe failed:\n${runProbe.stdout}\n${runProbe.stderr}`).toBe(0);
    const parsed = JSON.parse(runProbe.stdout) as { refused: string; ok: string; tmpEntries: string[] };
    expect(parsed).toEqual({ refused: "unavailable", ok: "available", tmpEntries: [] });
    expect(readdirSync(isolatedTmp)).toEqual([]);
  });

  it("request.configPaths cannot bypass repo discovery, commonDir verification, or local/worktree config include gating", async () => {
    const box = createSandbox();
    const { corpus, repository, declaration, fencingToken, hooksDir } = buildL0Setup(box);
    const gitConfigPath = join(corpus.repo, ".git", "config");
    const originalConfig = readFileSync(gitConfigPath, "utf8");
    const subDir = join(corpus.repo, "nested-no-dotgit");
    mkdirSync(subDir, { recursive: true });
    const cleanExtraConfig = join(box.root, "clean-extra.gitconfig");
    writeFileSync(cleanExtraConfig, "[user]\n\tname = clean-extra\n");
    const dirtyExtraConfig = join(box.root, "dirty-extra.gitconfig");
    writeFileSync(dirtyExtraConfig, "[include]\n\tpath = /nonexistent/extra-include\n");

    // 1. Inject include.path into .git/config and attempt bypasses via request.configPaths: []
    //    both from a subdirectory lacking .git (PoC) and from the repo root itself.
    writeFileSync(gitConfigPath, `${originalConfig}\n[include]\n\tpath = /nonexistent/outside-secret\n`);
    {
      const syncTracePath = join(box.root, "f1-bypass-sync-trace.jsonl");
      const syncSpawn = createTracedGitSpawn(box.root, hooksDir, syncTracePath);
      const streamPort = new TracedGitProcessPort(box.trace.executable, box.root, hooksDir);
      const sink = new FakeFencedSink();
      const persistence = new MemoryHistoryPersistence();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir, spawn: syncSpawn.spawn, process: streamPort },
          factSink: sink,
          historyPersistence: persistence,
        },
      });

      // Subdirectory cwd lacking .git + configPaths: [] must fail closed before ANY Git spawn or sink delivery.
      const subRefs = await factory.runCapability("refs", {
        cwd: subDir,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(40),
        fencingToken,
        configPaths: [],
      });
      expect(subRefs).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
      expect(syncSpawn.calls).toHaveLength(0);
      expect(sink.deliveries).toHaveLength(0);

      const subHist = await factory.runCapability("history-dag", {
        cwd: subDir,
        repository,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(41),
        fencingToken,
        configPaths: [],
      });
      expect(subHist).toMatchObject({ capability: "history-dag", state: "unavailable", delivered: false });
      expect(syncSpawn.calls).toHaveLength(0);
      expect(streamPort.launches).toHaveLength(0);
      expect(sink.deliveries).toHaveLength(0);

      // Repo root with include.path in .git/config + configPaths: [] or [cleanExtraConfig] must STILL fail closed.
      for (const overridePaths of [[], [cleanExtraConfig]] as const) {
        const rootRefs = await factory.runCapability("refs", {
          cwd: corpus.repo,
          defaultBranch: "refs/heads/main",
          generationId: formatProducerGenerationId(42),
          fencingToken,
          configPaths: overridePaths,
        });
        expect(rootRefs).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
        expect(rootRefs.reason).toMatch(/include|config/i);

        const rootHist = await factory.runCapability("history-dag", {
          cwd: corpus.repo,
          repository,
          defaultBranch: "refs/heads/main",
          generationId: formatProducerGenerationId(43),
          fencingToken,
          configPaths: overridePaths,
        });
        expect(rootHist).toMatchObject({ capability: "history-dag", state: "unavailable", delivered: false });
        expect(rootHist.reason).toMatch(/include|config/i);
      }
      expect(streamPort.launches).toHaveLength(0);
      expect(sink.deliveries).toHaveLength(0);
    }

    // Restore clean common config for subsequent checks.
    writeFileSync(gitConfigPath, originalConfig);

    // 2. Linked worktree config.worktree with include.path cannot be bypassed by passing only common config in request.configPaths.
    const detachedGitDir = box.git(corpus.detached, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
    const detachedWorktreeConfig = join(detachedGitDir, "config.worktree");
    writeFileSync(detachedWorktreeConfig, "[include]\n\tpath = /nonexistent/worktree-include\n");
    try {
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir },
          factSink: sink,
        },
      });
      const wtRefs = await factory.runCapability("refs", {
        cwd: corpus.detached,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(44),
        fencingToken,
        configPaths: [gitConfigPath],
      });
      expect(wtRefs).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
      expect(wtRefs.reason).toMatch(/include|config/i);
      expect(sink.deliveries).toHaveLength(0);
    } finally {
      if (existsSync(detachedWorktreeConfig)) unlinkSync(detachedWorktreeConfig);
    }

    // 3. history-dag commonDirRealpath check cannot be disabled by passing request.configPaths.
    {
      const streamPort = new TracedGitProcessPort(box.trace.executable, box.root, hooksDir);
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir, process: streamPort },
          factSink: sink,
          historyPersistence: new MemoryHistoryPersistence(),
        },
      });
      const mismatchedRepo = {
        ...repository,
        clone: { ...repository.clone, commonDirRealpath: box.root },
      };
      const res = await factory.runCapability("history-dag", {
        cwd: corpus.repo,
        repository: mismatchedRepo,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(45),
        fencingToken,
        configPaths: [gitConfigPath],
      });
      expect(res).toMatchObject({ capability: "history-dag", state: "unavailable", delivered: false });
      expect(res.reason).toMatch(/commonDirRealpath/i);
      expect(streamPort.launches).toHaveLength(0);
      expect(sink.deliveries).toHaveLength(0);
    }

    // 4. rev-parse git-dir/common-dir cross-check still runs when request.configPaths is supplied.
    {
      const syncTracePath = join(box.root, "f1-revparse-trace.jsonl");
      const baseSync = createTracedGitSpawn(box.root, hooksDir, syncTracePath);
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: {
            gitPath: box.trace.executable,
            disabledHooksDir: hooksDir,
            spawn: (gitPath, argv, opts) => {
              if (argv.includes("rev-parse") && argv.includes("--absolute-git-dir")) {
                return { status: 0, stdout: Buffer.from(`${box.root}\n`), stderr: Buffer.alloc(0) };
              }
              return baseSync.spawn(gitPath, argv, opts);
            },
          },
          factSink: sink,
        },
      });
      const res = await factory.runCapability("refs", {
        cwd: corpus.repo,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(46),
        fencingToken,
        configPaths: [cleanExtraConfig],
      });
      expect(res).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
      expect(res.reason).toMatch(/rev-parse|disagrees/i);
      expect(sink.deliveries).toHaveLength(0);
    }

    // 5. Additive request.configPaths: clean extra file succeeds, dirty extra file fails closed.
    {
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir },
          factSink: sink,
        },
      });
      const cleanRes = await factory.runCapability("refs", {
        cwd: corpus.repo,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(47),
        fencingToken,
        configPaths: [cleanExtraConfig],
      });
      expect(cleanRes).toMatchObject({ capability: "refs", state: "available", delivered: true });

      const dirtyRes = await factory.runCapability("refs", {
        cwd: corpus.repo,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(48),
        fencingToken,
        configPaths: [dirtyExtraConfig],
      });
      expect(dirtyRes).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
      expect(dirtyRes.reason).toMatch(/include|config/i);
    }
  });

  it("history-dag does not persist checkpoints or retained roots when factSink or end-of-round config verification fails", async () => {
    const box = createSandbox();
    const { corpus, repository, declaration, fencingToken, hooksDir } = buildL0Setup(box);
    const gitConfigPath = join(corpus.repo, ".git", "config");
    const originalConfig = readFileSync(gitConfigPath, "utf8");

    // 1. Rejecting factSink on round 1 must persist ZERO facts, checkpoints or retained roots,
    //    so round 2 with a healthy sink extracts and delivers the entire commit range.
    {
      const streamPort = new TracedGitProcessPort(box.trace.executable, box.root, hooksDir);
      const sink = new FakeFencedSink();
      sink.refuseWith = new Error("lease revoked at sink");
      const persistence = new MemoryHistoryPersistence();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir, process: streamPort },
          factSink: sink,
          historyPersistence: persistence,
        },
      });

      const round1 = await factory.runCapability("history-dag", {
        cwd: corpus.repo,
        repository,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(50),
        fencingToken,
        expectedIncarnation: fencingToken.projectionIncarnation,
      });
      expect(round1).toMatchObject({ capability: "history-dag", state: "unavailable", delivered: false });
      expect(sink.deliveries).toHaveLength(0);
      expect(persistence.completion.size).toBe(0);
      expect(persistence.facts.size).toBe(0);
      expect(persistence.retainedRoots.size).toBe(0);

      // Round 2: sink is healthy again — full commit range must be extracted and delivered.
      sink.refuseWith = undefined;
      const round2 = await factory.runCapability("history-dag", {
        cwd: corpus.repo,
        repository,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(51),
        fencingToken,
        expectedIncarnation: fencingToken.projectionIncarnation,
      });
      expect(round2).toMatchObject({ capability: "history-dag", state: "available", delivered: true });
      if (round2.state !== "available" || round2.capability !== "history-dag") {
        throw new Error(`expected available history-dag on round 2, got ${JSON.stringify(round2)}`);
      }
      expect(round2.outcome.stats.commitsExtracted).toBeGreaterThanOrEqual(6);
      expect(round2.outcome.stats.commitsSkippedComplete).toBe(0);
      const kinds = new Set(sink.deliveries.flatMap((d) => d.batch.facts).map((f) => classifyLiveFactKind(f)));
      expect(kinds.has("commit")).toBe(true);
      expect(kinds.has("changed-file")).toBe(true);
      expect(kinds.has("progress")).toBe(true);
      expect(kinds.has("coverage")).toBe(true);
      expect(persistence.completion.size).toBeGreaterThanOrEqual(6);
      expect(persistence.facts.size).toBeGreaterThanOrEqual(6);
      expect(persistence.retainedRoots.size).toBeGreaterThanOrEqual(2);

      // Round 3: incremental re-run now skips already-committed checkpoints.
      const round3 = await factory.runCapability("history-dag", {
        cwd: corpus.repo,
        repository,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(52),
        fencingToken,
        expectedIncarnation: fencingToken.projectionIncarnation,
      });
      expect(round3).toMatchObject({ capability: "history-dag", state: "available", delivered: true });
      if (round3.state === "available" && round3.capability === "history-dag") {
        expect(round3.outcome.stats.commitsExtracted).toBe(0);
        expect(round3.outcome.stats.commitsSkippedComplete).toBeGreaterThanOrEqual(6);
      }
    }

    // 2. End-of-round config include re-probe failure must persist ZERO checkpoints/facts/roots and deliver ZERO batches.
    {
      const innerStream = new TracedGitProcessPort(box.trace.executable, box.root, hooksDir);
      let injected = false;
      const tamperingStream: GitProcessPort = {
        start(launch) {
          if (!injected && launch.purpose === "rev-list-count") {
            injected = true;
            writeFileSync(gitConfigPath, `${originalConfig}\n[include]\n\tpath = /nonexistent/mid-round\n`);
          }
          return innerStream.start(launch);
        },
      };
      const sink = new FakeFencedSink();
      const persistence = new MemoryHistoryPersistence();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir, process: tamperingStream },
          factSink: sink,
          historyPersistence: persistence,
        },
      });
      try {
        const res = await factory.runCapability("history-dag", {
          cwd: corpus.repo,
          repository,
          defaultBranch: "refs/heads/main",
          generationId: formatProducerGenerationId(53),
          fencingToken,
        });
        expect(res).toMatchObject({ capability: "history-dag", state: "unavailable", delivered: false });
        expect(sink.deliveries).toHaveLength(0);
        expect(persistence.completion.size).toBe(0);
        expect(persistence.facts.size).toBe(0);
        expect(persistence.retainedRoots.size).toBe(0);
      } finally {
        writeFileSync(gitConfigPath, originalConfig);
      }
    }

    // 3. Fencing token expiring during sink delivery must prevent committing staged persistence writes.
    {
      let currentNow = FIXTURE_NOW;
      const streamPort = new TracedGitProcessPort(box.trace.executable, box.root, hooksDir);
      const persistence = new MemoryHistoryPersistence();
      const expiringSink: FactSinkPort = {
        async deliver(batch) {
          currentNow = fencingToken.expiresAt + 1;
          return { received: true, batchId: batch.batchId };
        },
      };
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          clock: { now: () => currentNow },
          git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir, process: streamPort },
          factSink: expiringSink,
          historyPersistence: persistence,
        },
      });
      const res = await factory.runCapability("history-dag", {
        cwd: corpus.repo,
        repository,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(54),
        fencingToken,
      });
      expect(res).toMatchObject({ capability: "history-dag", state: "unavailable", delivered: false });
      expect(res.reason).toMatch(/fencing|expired|token/i);
      expect(persistence.completion.size).toBe(0);
      expect(persistence.facts.size).toBe(0);
      expect(persistence.retainedRoots.size).toBe(0);
    }
  });

  it("history-dag streaming Git process launches carry SafeGitExecutor full hardened -c config set", async () => {
    const box = createSandbox();
    const { corpus, repository, declaration, fencingToken, hooksDir } = buildL0Setup(box);
    const streamPort = new TracedGitProcessPort(box.trace.executable, box.root, hooksDir);
    const sink = new FakeFencedSink();
    const factory = createLiveFactory({
      declaration,
      ports: {
        ...makeNoopAuxPorts(),
        git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir, process: streamPort },
        factSink: sink,
        historyPersistence: new MemoryHistoryPersistence(),
      },
    });

    const result = await factory.runCapability("history-dag", {
      cwd: corpus.repo,
      repository,
      defaultBranch: "refs/heads/main",
      generationId: formatProducerGenerationId(60),
      fencingToken,
    });
    expect(result).toMatchObject({ capability: "history-dag", state: "available", delivered: true });
    expect(streamPort.launches.length).toBeGreaterThanOrEqual(3);

    const requiredConfigOverrides = [
      "core.fsmonitor=false",
      `core.hooksPath=${hooksDir}`,
      "core.attributesFile=/dev/null",
      "core.excludesFile=/dev/null",
      "gc.auto=0",
      "maintenance.auto=false",
      "protocol.allow=never",
      "core.quotePath=true",
      "mailmap.file=/dev/null",
      "mailmap.blob=",
    ];
    for (const launch of streamPort.launches) {
      const subcmdIdx = launch.args.findIndex((arg) => arg === "rev-list" || arg === "cat-file" || arg === "diff-tree");
      expect(subcmdIdx, `expected git subcommand in ${JSON.stringify(launch.args)}`).toBeGreaterThan(0);
      const globalArgs = launch.args.slice(0, subcmdIdx);
      expect(globalArgs.filter((arg) => arg === "--no-pager")).toHaveLength(1);
      expect(globalArgs.filter((arg) => arg === "--no-optional-locks")).toHaveLength(1);
      for (const expectedOverride of requiredConfigOverrides) {
        const matches = globalArgs.reduce((count, arg, idx) => {
          return arg === "-c" && globalArgs[idx + 1] === expectedOverride ? count + 1 : count;
        }, 0);
        expect(matches, `launch ${launch.purpose} must carry single -c ${expectedOverride}`).toBe(1);
      }
    }
    streamPort.assertSafeTrace();
  });

  it("refs and history-dag detect non-include config tamper and transient edit-and-revert via before/after config fingerprint", async () => {
    const box = createSandbox();
    const { corpus, repository, declaration, fencingToken, hooksDir } = buildL0Setup(box);
    const gitConfigPath = join(corpus.repo, ".git", "config");
    const originalConfig = readFileSync(gitConfigPath, "utf8");

    // 1. refs: non-include config edit during round is detected by content fingerprint.
    {
      const syncTracePath = join(box.root, "f4-refs-edit-trace.jsonl");
      const baseSync = createTracedGitSpawn(box.root, hooksDir, syncTracePath);
      let mutated = false;
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: {
            gitPath: box.trace.executable,
            disabledHooksDir: hooksDir,
            spawn: (gitPath, argv, opts) => {
              const out = baseSync.spawn(gitPath, argv, opts);
              if (!mutated && argv.includes("for-each-ref")) {
                mutated = true;
                writeFileSync(gitConfigPath, `${originalConfig}\n[user]\n\tname = tampered-non-include\n`);
              }
              return out;
            },
          },
          factSink: sink,
        },
      });
      try {
        const res = await factory.runCapability("refs", {
          cwd: corpus.repo,
          defaultBranch: "refs/heads/main",
          generationId: formatProducerGenerationId(70),
          fencingToken,
        });
        expect(res).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
        expect(res.reason).toMatch(/fingerprint|changed|configuration/i);
        expect(sink.deliveries).toHaveLength(0);
      } finally {
        writeFileSync(gitConfigPath, originalConfig);
      }
    }

    // 2. refs: transient edit-and-revert (atomic replace back to identical bytes) is detected by fingerprint metadata.
    {
      const syncTracePath = join(box.root, "f4-refs-revert-trace.jsonl");
      const baseSync = createTracedGitSpawn(box.root, hooksDir, syncTracePath);
      let replaced = false;
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: {
            gitPath: box.trace.executable,
            disabledHooksDir: hooksDir,
            spawn: (gitPath, argv, opts) => {
              const out = baseSync.spawn(gitPath, argv, opts);
              if (!replaced && argv.includes("for-each-ref")) {
                replaced = true;
                const staging = join(corpus.repo, ".git", "config.transient-revert");
                writeFileSync(staging, originalConfig);
                renameSync(staging, gitConfigPath);
              }
              return out;
            },
          },
          factSink: sink,
        },
      });
      const res = await factory.runCapability("refs", {
        cwd: corpus.repo,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(71),
        fencingToken,
      });
      expect(res).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
      expect(res.reason).toMatch(/fingerprint|changed|configuration/i);
      expect(sink.deliveries).toHaveLength(0);
    }

    // 3. refs: benign config.worktree created mid-round is detected by fingerprint.
    {
      const syncTracePath = join(box.root, "f4-refs-wtcfg-trace.jsonl");
      const baseSync = createTracedGitSpawn(box.root, hooksDir, syncTracePath);
      const wtConfigPath = join(corpus.repo, ".git", "config.worktree");
      let created = false;
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: {
            gitPath: box.trace.executable,
            disabledHooksDir: hooksDir,
            spawn: (gitPath, argv, opts) => {
              const out = baseSync.spawn(gitPath, argv, opts);
              if (!created && argv.includes("for-each-ref")) {
                created = true;
                writeFileSync(wtConfigPath, "[user]\n\tname = midround-wt\n");
              }
              return out;
            },
          },
          factSink: sink,
        },
      });
      try {
        const res = await factory.runCapability("refs", {
          cwd: corpus.repo,
          defaultBranch: "refs/heads/main",
          generationId: formatProducerGenerationId(72),
          fencingToken,
        });
        expect(res).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
        expect(res.reason).toMatch(/fingerprint|changed|configuration/i);
        expect(sink.deliveries).toHaveLength(0);
      } finally {
        if (existsSync(wtConfigPath)) unlinkSync(wtConfigPath);
      }
    }

    // 4. history-dag: non-include config edit AND transient edit-and-revert during round both fail closed with 0 persistence & 0 sink writes.
    for (const [idx, mode] of (["edit", "transient-revert"] as const).entries()) {
      const innerStream = new TracedGitProcessPort(box.trace.executable, box.root, hooksDir);
      let triggered = false;
      const tamperingStream: GitProcessPort = {
        start(launch) {
          if (!triggered && launch.purpose === "rev-list-count") {
            triggered = true;
            if (mode === "edit") {
              writeFileSync(gitConfigPath, `${originalConfig}\n[user]\n\tname = tampered-history\n`);
            } else {
              const staging = join(corpus.repo, ".git", "config.transient-revert");
              writeFileSync(staging, originalConfig);
              renameSync(staging, gitConfigPath);
            }
          }
          return innerStream.start(launch);
        },
      };
      const sink = new FakeFencedSink();
      const persistence = new MemoryHistoryPersistence();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir, process: tamperingStream },
          factSink: sink,
          historyPersistence: persistence,
        },
      });
      try {
        const res = await factory.runCapability("history-dag", {
          cwd: corpus.repo,
          repository,
          defaultBranch: "refs/heads/main",
          generationId: formatProducerGenerationId(73 + idx),
          fencingToken,
        });
        expect(res, `history-dag must fail closed on ${mode}`).toMatchObject({
          capability: "history-dag",
          state: "unavailable",
          delivered: false,
        });
        expect(res.reason).toMatch(/fingerprint|changed|configuration/i);
        expect(sink.deliveries).toHaveLength(0);
        expect(persistence.completion.size).toBe(0);
        expect(persistence.facts.size).toBe(0);
        expect(persistence.retainedRoots.size).toBe(0);
      } finally {
        writeFileSync(gitConfigPath, originalConfig);
      }
    }
  });

  it("github-pr validates and pins request.attributions before invoking runPrSyncPass or mutating prPersistence", async () => {
    const box = createSandbox();
    const { declaration, fencingToken } = buildL0Setup(box);
    const { repository: ghRepo, pages } = loadP1Fixture();
    const samplePr = pages[0]!.items[0]!;

    const invalidAttributionCases: Array<{ readonly label: string; readonly attributions: unknown }> = [
      { label: "non-array attributions", attributions: "not-an-array" },
      { label: "non-object attribution entry", attributions: [null] },
      {
        label: "foreign repository attribution",
        attributions: [
          {
            repositoryOwner: "other-org",
            repositoryRepo: ghRepo.repo,
            prNumber: samplePr.number,
            baseOid: samplePr.baseOid,
            headOid: samplePr.headOid,
            mergeBaseOids: [samplePr.baseOid],
            mergeStrategy: "merge",
          },
        ],
      },
      {
        label: "invalid head OID rejected by pinPrAttribution",
        attributions: [
          {
            repositoryOwner: ghRepo.owner,
            repositoryRepo: ghRepo.repo,
            prNumber: samplePr.number,
            baseOid: samplePr.baseOid,
            headOid: { algorithm: "sha1", oid: "not-a-hex-oid" },
            mergeBaseOids: [samplePr.baseOid],
            mergeStrategy: "merge",
          },
        ],
      },
      {
        label: "partial attribution with invalid prNumber rejected by validatePrAttribution",
        attributions: [
          {
            repositoryOwner: ghRepo.owner,
            repositoryRepo: ghRepo.repo,
            prNumber: 0,
            baseOid: samplePr.baseOid,
            headOid: samplePr.headOid,
            mergeBaseOids: [],
            mergeStrategy: "merge",
          },
        ],
      },
    ];

    for (const [idx, testCase] of invalidAttributionCases.entries()) {
      const prTransport = new FixtureGithubPrTransport(pages);
      const prPersistence = new MemoryPrPersistence();
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          githubPr: prTransport,
          prPersistence,
          factSink: sink,
        },
      });

      const res = await factory.runCapability("github-pr", {
        repository: ghRepo,
        sweepKind: "full",
        generationId: formatProducerGenerationId(80 + idx),
        fencingToken,
        attributions: testCase.attributions as never,
      });

      expect(res, `github-pr must fail closed for ${testCase.label}`).toMatchObject({
        capability: "github-pr",
        state: "unavailable",
        delivered: false,
      });
      expect(res.reason, `reason for ${testCase.label}`).toMatch(/attribution/i);
      expect(prTransport.requests, `transport must not be called for ${testCase.label}`).toHaveLength(0);
      expect(prPersistence.cursor, `cursor must not be saved for ${testCase.label}`).toBeNull();
      expect(prPersistence.observations.size, `observations must not be saved for ${testCase.label}`).toBe(0);
      expect(prPersistence.jobs.size, `object jobs must not be saved for ${testCase.label}`).toBe(0);
      expect(sink.deliveries, `sink must receive 0 deliveries for ${testCase.label}`).toHaveLength(0);
    }
  });

  it("refs and history-dag refuse symbolic links on repository and extra config paths before and during rounds", async () => {
    const box = createSandbox();
    const { corpus, repository, declaration, fencingToken, hooksDir } = buildL0Setup(box);
    const gitConfigPath = join(corpus.repo, ".git", "config");
    const originalConfig = readFileSync(gitConfigPath, "utf8");
    const externalConfig = join(box.root, "external-git.config");
    writeFileSync(externalConfig, originalConfig);

    // 1. Pre-existing symlink at .git/config pointing to an external config file (with mid-round tamper hook)
    //    must be refused before any for-each-ref or streaming history execution.
    {
      unlinkSync(gitConfigPath);
      symlinkSync(externalConfig, gitConfigPath);
      try {
        const syncTracePath = join(box.root, "r2-symlink-start-trace.jsonl");
        const baseSync = createTracedGitSpawn(box.root, hooksDir, syncTracePath);
        const streamPort = new TracedGitProcessPort(box.trace.executable, box.root, hooksDir);
        let tamperedTarget = false;
        const sink = new FakeFencedSink();
        const persistence = new MemoryHistoryPersistence();
        const factory = createLiveFactory({
          declaration,
          ports: {
            ...makeNoopAuxPorts(),
            git: {
              gitPath: box.trace.executable,
              disabledHooksDir: hooksDir,
              spawn: (gitPath, argv, opts) => {
                const out = baseSync.spawn(gitPath, argv, opts);
                if (!tamperedTarget && argv.includes("for-each-ref")) {
                  tamperedTarget = true;
                  writeFileSync(externalConfig, `${originalConfig}\n[user]\n\tname = tampered-symlink-target\n`);
                }
                return out;
              },
              process: streamPort,
            },
            factSink: sink,
            historyPersistence: persistence,
          },
        });

        const refsRes = await factory.runCapability("refs", {
          cwd: corpus.repo,
          defaultBranch: "refs/heads/main",
          generationId: formatProducerGenerationId(90),
          fencingToken,
        });
        expect(refsRes).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
        expect(refsRes.reason).toMatch(/symbolic link|symlink/i);
        expect(tamperedTarget).toBe(false);
        expect(baseSync.calls).toHaveLength(0);

        const histRes = await factory.runCapability("history-dag", {
          cwd: corpus.repo,
          repository,
          defaultBranch: "refs/heads/main",
          generationId: formatProducerGenerationId(91),
          fencingToken,
        });
        expect(histRes).toMatchObject({ capability: "history-dag", state: "unavailable", delivered: false });
        expect(histRes.reason).toMatch(/symbolic link|symlink/i);
        expect(streamPort.launches).toHaveLength(0);
        expect(sink.deliveries).toHaveLength(0);
        expect(persistence.completion.size).toBe(0);
        expect(persistence.facts.size).toBe(0);
        expect(persistence.retainedRoots.size).toBe(0);
      } finally {
        if (existsSync(gitConfigPath)) unlinkSync(gitConfigPath);
        writeFileSync(gitConfigPath, originalConfig);
        writeFileSync(externalConfig, originalConfig);
      }
    }

    // 2. Symbolic link passed in additive request.configPaths must be refused fail-closed.
    {
      const extraSymlink = join(box.root, "extra-config-symlink.gitconfig");
      symlinkSync(externalConfig, extraSymlink);
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: {
            gitPath: box.trace.executable,
            disabledHooksDir: hooksDir,
            process: new TracedGitProcessPort(box.trace.executable, box.root, hooksDir),
          },
          factSink: sink,
          historyPersistence: new MemoryHistoryPersistence(),
        },
      });
      const refsRes = await factory.runCapability("refs", {
        cwd: corpus.repo,
        defaultBranch: "refs/heads/main",
        generationId: formatProducerGenerationId(92),
        fencingToken,
        configPaths: [extraSymlink],
      });
      expect(refsRes).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
      expect(refsRes.reason).toMatch(/symbolic link|symlink/i);
      expect(sink.deliveries).toHaveLength(0);
    }

    // 3. Regular .git/config swapped mid-round for a symlink pointing to an identical copy
    //    must be rejected at end-of-round verification for both refs and history-dag.
    {
      const syncTracePath = join(box.root, "r2-symlink-midround-trace.jsonl");
      const baseSync = createTracedGitSpawn(box.root, hooksDir, syncTracePath);
      let swappedRefs = false;
      const sink = new FakeFencedSink();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: {
            gitPath: box.trace.executable,
            disabledHooksDir: hooksDir,
            spawn: (gitPath, argv, opts) => {
              const out = baseSync.spawn(gitPath, argv, opts);
              if (!swappedRefs && argv.includes("for-each-ref")) {
                swappedRefs = true;
                unlinkSync(gitConfigPath);
                symlinkSync(externalConfig, gitConfigPath);
              }
              return out;
            },
          },
          factSink: sink,
        },
      });
      try {
        const res = await factory.runCapability("refs", {
          cwd: corpus.repo,
          defaultBranch: "refs/heads/main",
          generationId: formatProducerGenerationId(93),
          fencingToken,
        });
        expect(res).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });
        expect(res.reason).toMatch(/symbolic link|symlink|fingerprint/i);
        expect(sink.deliveries).toHaveLength(0);
      } finally {
        if (existsSync(gitConfigPath)) unlinkSync(gitConfigPath);
        writeFileSync(gitConfigPath, originalConfig);
      }
    }

    {
      const innerStream = new TracedGitProcessPort(box.trace.executable, box.root, hooksDir);
      let swappedHistory = false;
      const swappingStream: GitProcessPort = {
        start(launch) {
          if (!swappedHistory && launch.purpose === "rev-list-count") {
            swappedHistory = true;
            unlinkSync(gitConfigPath);
            symlinkSync(externalConfig, gitConfigPath);
          }
          return innerStream.start(launch);
        },
      };
      const sink = new FakeFencedSink();
      const persistence = new MemoryHistoryPersistence();
      const factory = createLiveFactory({
        declaration,
        ports: {
          ...makeNoopAuxPorts(),
          git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir, process: swappingStream },
          factSink: sink,
          historyPersistence: persistence,
        },
      });
      try {
        const res = await factory.runCapability("history-dag", {
          cwd: corpus.repo,
          repository,
          defaultBranch: "refs/heads/main",
          generationId: formatProducerGenerationId(94),
          fencingToken,
        });
        expect(res).toMatchObject({ capability: "history-dag", state: "unavailable", delivered: false });
        expect(res.reason).toMatch(/symbolic link|symlink|fingerprint/i);
        expect(sink.deliveries).toHaveLength(0);
        expect(persistence.completion.size).toBe(0);
        expect(persistence.facts.size).toBe(0);
        expect(persistence.retainedRoots.size).toBe(0);
      } finally {
        if (existsSync(gitConfigPath)) unlinkSync(gitConfigPath);
        writeFileSync(gitConfigPath, originalConfig);
      }
    }
  });
});

// — E-ASM3 helpers (self-contained in the neutral test closure: no root imports).

const encUtf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function collectAllStrings(value: unknown): string[] {
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (typeof node === "string") {
      out.push(node);
    } else if (node instanceof Uint8Array) {
      out.push(new TextDecoder().decode(node));
    } else if (Array.isArray(node)) {
      for (const item of node) visit(item);
    } else if (node !== null && typeof node === "object") {
      for (const item of Object.values(node as Record<string, unknown>)) visit(item);
    }
  };
  visit(value);
  return out;
}

class FakeLocalProtectionPort implements ContentProtectionPort {
  readonly calls: Uint8Array[] = [];
  keyRef = "fake-key:easm3-001";
  refuseWith?: Error;

  async protect(plaintext: Uint8Array): Promise<SealedPayload> {
    if (this.refuseWith !== undefined) throw this.refuseWith;
    this.calls.push(Uint8Array.from(plaintext));
    const digest = createHash("sha256").update(plaintext).digest("hex");
    return {
      state: "sealed",
      algorithm: "fake-seal/1",
      keyRef: this.keyRef,
      ciphertext: encUtf8(`sealed:${digest}:${plaintext.byteLength}`),
    };
  }
}

class FakeLocalKeyProvider implements KeyProviderPort {
  available = true;
  keyRef = "fake-key:easm3-001";
  unavailableReason = "protection key unavailable for scope";
  refuseWith?: Error;

  async currentKeyRef(): Promise<
    { readonly state: "available"; readonly keyRef: string } |
    { readonly state: "unavailable"; readonly reason: string }
  > {
    if (this.refuseWith !== undefined) throw this.refuseWith;
    if (!this.available) return { state: "unavailable", reason: this.unavailableReason };
    return { state: "available", keyRef: this.keyRef };
  }
}

class FakeLatestSnapshotStore implements LatestSnapshotPort {
  readonly stored: LocalSnapshotDto[] = [];
  readonly deleted: string[] = [];
  readonly latest = new Map<string, LocalSnapshotDto>();
  private readonly knownGenerations = new Set<string>();
  private readonly blockedGenerations = new Set<string>();

  private targetKey(q: { scope: LiveScope; worktreeId: string; kind: string; diffKind: string }): string {
    return [q.scope.tenant, q.scope.clone, q.scope.worktree ?? "", q.worktreeId, q.kind, q.diffKind].join("|");
  }

  async loadLatest(query: LatestSnapshotQuery): Promise<LocalSnapshotDto | null> {
    if (this.blockedGenerations.has(query.generationId)) {
      throw new Error("stale generation blocked after purge");
    }
    this.knownGenerations.add(query.generationId);
    return this.latest.get(this.targetKey(query)) ?? null;
  }

  async replaceLatest(
    snapshot: LocalSnapshotDto,
    expectedSupersededId: string | null,
    generationId: string,
  ): Promise<ReplaceLatestReceipt> {
    if (this.blockedGenerations.has(generationId)) {
      throw new Error("stale generation blocked after purge");
    }
    const key = this.targetKey(snapshot);
    const current = this.latest.get(key) ?? null;
    if ((current?.snapshotId ?? null) !== expectedSupersededId) {
      throw new Error("latest replacement conflict: expected predecessor is no longer latest");
    }
    const replaced = current !== null && current.snapshotId !== snapshot.snapshotId;
    if (replaced) {
      this.deleted.push(current.snapshotId);
      const idx = this.stored.findIndex((item) => item.snapshotId === current.snapshotId);
      if (idx >= 0) this.stored.splice(idx, 1);
    }
    if (current?.snapshotId !== snapshot.snapshotId) this.stored.push(snapshot);
    this.latest.set(key, snapshot);
    return {
      received: true,
      retiredPrevious: replaced,
      revokedDecryptability: true,
      blockedStaleWork: true,
    };
  }

  async purgePrivate(_query: LatestSnapshotScope): Promise<PurgePrivateReceipt> {
    for (const g of this.knownGenerations) this.blockedGenerations.add(g);
    this.knownGenerations.clear();
    this.latest.clear();
    this.stored.length = 0;
    return { purgedPrivate: true, blockedOldWork: true, revokedDecryptability: true };
  }
}

class FakePrivateFencedSink implements FactSinkPort {
  readonly deliveries: RecordedDelivery[] = [];
  private readonly highestGenByTarget = new Map<string, string>();
  refuseWith?: Error;
  validateToken?: (token: ScopeFencingTokenDto) => boolean;

  async deliver(batch: FactBatchDto, fencingToken: ScopeFencingTokenDto): Promise<FactSinkReceipt> {
    if (this.refuseWith !== undefined) throw this.refuseWith;
    if (this.validateToken && !this.validateToken(fencingToken)) {
      throw new Error("FENCING_REJECTED: revoked or invalid token");
    }
    const checked = validateFactBatch(batch);
    if (!checked.ok) {
      throw new Error(`sink rejected invalid batch: ${checked.errors.join("; ")}`);
    }
    const localDiff = batch.facts.find((fact) => classifyLiveFactKind(fact) === "local-diff") as LocalDiffDto | undefined;
    const localSnap = batch.facts.find((fact) => classifyLiveFactKind(fact) === "local-snapshot") as LocalSnapshotDto | undefined;
    if (localDiff !== undefined) {
      const target = [
        batch.scope.tenant,
        batch.scope.clone,
        batch.scope.worktree ?? "",
        localDiff.worktreeId,
        localSnap?.kind ?? (localDiff.kind === "unstaged" ? "working-tree" : "index"),
        localDiff.kind,
      ].join("|");
      const prev = this.highestGenByTarget.get(target);
      if (prev !== undefined && batch.generationId <= prev) {
        throw new Error(`stale generation ${batch.generationId} <= ${prev} for target ${target}`);
      }
      this.highestGenByTarget.set(target, batch.generationId);
    }
    const receipt: FactSinkReceipt = {
      received: true,
      batchId: batch.batchId,
      receiptId: `rcpt:priv:${String(this.deliveries.length + 1).padStart(6, "0")}`,
      retiredSuperseded: true,
      revokedDecryptability: true,
    };
    this.deliveries.push({ batch, fencingToken, receipt });
    return receipt;
  }
}

interface TestFakeClock {
  now(): number;
  advance(ms: number): void;
  schedule(ms: number, callback: () => void): () => void;
}

function makeFakeScheduleClock(startAt = FIXTURE_NOW): TestFakeClock {
  let t = startAt;
  const timers = new Set<{ at: number; callback: () => void }>();
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
      for (const timer of [...timers]) {
        if (timer.at <= t) {
          timers.delete(timer);
          timer.callback();
        }
      }
    },
    schedule: (ms: number, callback: () => void) => {
      const entry = { at: t + ms, callback };
      timers.add(entry);
      return () => {
        timers.delete(entry);
      };
    },
  };
}

class TestWatchPort implements WatchPort {
  starts = 0;
  stops = 0;
  private listener: ((event: WatchEvent) => void) | undefined;
  private readyResolve: (() => void) | undefined;
  private readyPromise: Promise<void> | undefined;
  autoReady = true;

  constructor(private readonly clock: TestFakeClock) {}

  async start(): Promise<void> {
    this.starts += 1;
    if (this.autoReady) return;
    this.readyPromise ??= new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
    return this.readyPromise;
  }

  releaseReady(): void {
    this.readyResolve?.();
  }

  async stop(): Promise<void> {
    this.stops += 1;
  }

  onSignal(listener: (event: WatchEvent) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = undefined;
    };
  }

  emit(kind: WatchEvent["kind"], paths: readonly string[] = []): void {
    this.listener?.({ kind, paths, at: this.clock.now() });
  }
}

class TestWriterAuthority implements WriterAuthority {
  currentEpoch = 1;
  allowAcquire = true;
  allowRenew = true;
  readonly acquiredTokens: ScopeFencingTokenDto[] = [];
  readonly releasedTokens: string[] = [];
  readonly revokedTokenIds = new Set<string>();
  private mintSeq = 0;
  private activeToken: ScopeFencingTokenDto | undefined;

  constructor(
    private readonly clock: TestFakeClock,
    private readonly expectedScope: LiveScope,
    private readonly expectedRevision: number,
    private readonly getIncarnation: () => string,
  ) {}

  async acquire(request: WriterRequest): Promise<ScopeFencingTokenDto | undefined> {
    if (!this.allowAcquire) return undefined;
    if (request.declarationRevision !== this.expectedRevision) return undefined;
    if (request.projectionIncarnation !== this.getIncarnation()) return undefined;
    if (this.activeToken !== undefined) {
      this.revokedTokenIds.add(this.activeToken.tokenId);
    }
    this.currentEpoch = Math.max(this.currentEpoch + 1, request.minEpoch);
    const issuedAt = this.clock.now();
    const token: ScopeFencingTokenDto = {
      tokenId: `tok:sched:${++this.mintSeq}`,
      scope: { ...this.expectedScope },
      epoch: this.currentEpoch,
      epochId: `epoch:${this.currentEpoch}`,
      declarationRevision: request.declarationRevision,
      projectionIncarnation: request.projectionIncarnation,
      issuedAt,
      expiresAt: issuedAt + 60_000,
    };
    this.activeToken = token;
    this.acquiredTokens.push(token);
    return token;
  }

  async renew(token: ScopeFencingTokenDto): Promise<ScopeFencingTokenDto | undefined> {
    if (!this.allowRenew || !this.validate(token)) return undefined;
    const issuedAt = this.clock.now();
    const renewed: ScopeFencingTokenDto = {
      ...token,
      tokenId: `tok:sched:${++this.mintSeq}`,
      issuedAt,
      expiresAt: issuedAt + 60_000,
    };
    this.revokedTokenIds.add(token.tokenId);
    this.activeToken = renewed;
    this.acquiredTokens.push(renewed);
    return renewed;
  }

  validate(token: ScopeFencingTokenDto): boolean {
    if (!token || this.revokedTokenIds.has(token.tokenId)) return false;
    if (this.activeToken !== undefined && token.tokenId !== this.activeToken.tokenId) return false;
    if (token.epoch < this.currentEpoch) return false;
    return validateScopeFencingToken(token, this.expectedScope, this.getIncarnation(), this.clock.now()).ok;
  }

  revoke(token: ScopeFencingTokenDto): void {
    this.revokedTokenIds.add(token.tokenId);
    if (this.activeToken?.tokenId === token.tokenId) this.activeToken = undefined;
  }

  async release(token: ScopeFencingTokenDto): Promise<void> {
    this.revokedTokenIds.add(token.tokenId);
    if (this.activeToken?.tokenId === token.tokenId) this.activeToken = undefined;
    this.releasedTokens.push(token.tokenId);
  }
}

class TestSchedulingWorld {
  incarnationId = "inc:sched-001";
  readonly sourceFiles = new Map<string, string>();
  readonly projectedFiles = new Map<string, string>();
  readonly refs = new Map<string, string>([["refs/heads/main", "a".repeat(40)]]);
  readonly markers = new Map<string, string>();
  readonly publishedGenerations = new Set<string>();
  readonly progress = new Map<string, { attempts: number; receiptId?: string; digest: string; scopeId: string }>();
  readonly parked: { id: string; reason: string; attempts: number }[] = [];
  collectCalls = 0;
  publishCalls = 0;
  fullScans = 0;
  onDuringCollect?: (options: CollectOptions) => void;
  onDuringPublish?: (options: CollectOptions) => void;

  constructor(
    private readonly clock: TestFakeClock,
    readonly authority: TestWriterAuthority,
  ) {}

  private assertValid(token: ScopeFencingTokenDto, op: string): void {
    if (!this.authority.validate(token)) {
      throw new Error(`FENCING_REJECTED:${op}`);
    }
  }

  sourceVector(): SourceVector {
    const entries = [...this.sourceFiles.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const refs = [...this.refs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return {
      refsFingerprint: sha256Text(JSON.stringify(refs)),
      headOid: this.refs.get("refs/heads/main") ?? "0".repeat(40),
      indexFingerprint: sha256Text(JSON.stringify(entries.map(([p]) => p))),
      pathMembershipFingerprint: sha256Text(JSON.stringify(entries.map(([p]) => p))),
      contentFingerprint: sha256Text(JSON.stringify(entries)),
      configAttributesFingerprint: sha256Text("config:v1"),
      lockStateValid: true,
    };
  }

  dataMatchesSource(): boolean {
    if (this.sourceFiles.size !== this.projectedFiles.size) return false;
    for (const [k, v] of this.sourceFiles) {
      if (this.projectedFiles.get(k) !== v) return false;
    }
    return true;
  }

  markerStore(): MarkerStore {
    return {
      get: (key) => this.markers.get(key),
      set: (key, value, token) => {
        this.assertValid(token, "marker.set");
        this.markers.set(key, value);
      },
      delete: (key, token) => {
        this.assertValid(token, "marker.delete");
        this.markers.delete(key);
      },
      incarnation: () => this.incarnationId,
      hasGeneration: (inc, genId) => inc === this.incarnationId && this.publishedGenerations.has(genId),
    };
  }

  scan(): ReconcileScan {
    return {
      discoverPage: async (cursor: string | undefined, limits: DiscoveryLimits, options: CollectOptions): Promise<DiscoveryPage> => {
        this.assertValid(options.fencingToken, "discoverPage");
        options.resources.check();
        if (cursor === undefined) this.fullScans += 1;
        const keys = [...this.sourceFiles.keys()].sort();
        const start = cursor === undefined ? 0 : Number(cursor);
        const slice = keys.slice(start, start + limits.maxCount);
        const next = start + slice.length;
        const done = next >= keys.length;
        return {
          entries: slice.map((path) => {
            const content = this.sourceFiles.get(path)!;
            return {
              path,
              statSize: Buffer.byteLength(content, "utf8"),
              contentFingerprint: sha256Text(content),
            };
          }),
          deletedPaths: done ? [...this.projectedFiles.keys()].filter((p) => !this.sourceFiles.has(p)).slice(0, Math.max(0, limits.maxCount - slice.length)) : [],
          nextCursor: done ? undefined : String(next),
          done,
          complete: true,
        };
      },
      collectPaths: async (paths: readonly string[], options: CollectOptions) => {
        this.assertValid(options.fencingToken, "collectPaths");
        options.resources.check();
        this.collectCalls += 1;
        this.onDuringCollect?.(options);
        this.assertValid(options.fencingToken, "collectPaths.after");
        options.resources.check();
        for (const p of paths) {
          const val = this.sourceFiles.get(p);
          if (val !== undefined) this.projectedFiles.set(p, val);
          else this.projectedFiles.delete(p);
        }
        for (const d of options.deletedPaths) this.projectedFiles.delete(d);
        return { collected: [...paths], complete: true, receiptId: `collect:${this.collectCalls}` };
      },
      repairRelations: async (_paths: readonly string[], _deletedPaths: readonly string[], options: CollectOptions) => {
        this.assertValid(options.fencingToken, "repairRelations");
        options.resources.check();
        return { complete: true, receiptId: `repair:${this.collectCalls}` };
      },
      validateSource: async (_expected: SourceVector, options: CollectOptions): Promise<SourceValidationReport> => {
        this.assertValid(options.fencingToken, "validateSource");
        options.resources.check();
        const axes: Record<string, { readonly complete: boolean }> = {};
        for (const axis of COVERAGE_AXES) axes[axis] = { complete: true };
        return {
          valid: true,
          projectionMatches: this.dataMatchesSource(),
          sourceVector: this.sourceVector(),
          validatedAt: this.clock.now(),
          axes,
        };
      },
      publishGeneration: async (request: PublishGenerationRequest, options: CollectOptions): Promise<PublishGenerationReport> => {
        this.assertValid(options.fencingToken, "publishGeneration");
        options.resources.check();
        this.onDuringPublish?.(options);
        this.assertValid(options.fencingToken, "publishGeneration.after");
        options.resources.check();
        if (request.expectedIncarnation !== this.incarnationId) {
          throw new Error("incarnation mismatch");
        }
        this.publishCalls += 1;
        this.publishedGenerations.add(request.generationId);
        return {
          published: true,
          generationId: request.generationId,
          incarnation: this.incarnationId,
          receiptId: `pub:${this.publishCalls}`,
        };
      },
      currentSourceVector: () => this.sourceVector(),
      pathFingerprint: (path: string) => {
        const val = this.sourceFiles.get(path);
        return val === undefined ? "absent" : sha256Text(val);
      },
    };
  }

  pollRefs = async (options: CollectOptions) => {
    this.assertValid(options.fencingToken, "pollRefs");
    options.resources.check();
    return [...this.refs.entries()].map(([ref, oid]) => ({ ref, oid }));
  };

  durability() {
    return {
      sleep: (ms: number, signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          if (signal.aborted) {
            reject(new Error("aborted"));
            return;
          }
          const cancel = this.clock.schedule(ms, () => resolve());
          signal.addEventListener("abort", () => {
            cancel();
            reject(new Error("aborted"));
          }, { once: true });
        }),
      park: (item: WorkItem, reason: string, attempts: number) => {
        this.assertValid(item.fencingToken, "park");
        this.parked.push({ id: item.id, reason, attempts });
      },
      readProgress: (item: WorkItem) => {
        this.assertValid(item.fencingToken, "readProgress");
        return this.progress.get(item.id);
      },
      writeProgress: (item: WorkItem, prog: { readonly attempts: number; readonly receiptId?: string }) => {
        this.assertValid(item.fencingToken, "writeProgress");
        this.progress.set(item.id, {
          attempts: prog.attempts,
          receiptId: prog.receiptId,
          digest: item.idempotencyDigest,
          scopeId: item.scopeId,
        });
      },
      backlogSize: () => this.parked.length,
    };
  }
}

function makeSourceGrammarRuntime(): {
  readonly grammarRuntime: GrammarRuntimePort;
  readonly filesystem: LiveFactoryPorts["filesystem"];
} {
  const manifestPath = join(root, "engram-live", "grammar-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    languages: Record<string, { file: string; sourcePath: string }>;
  };
  const fileToSource = new Map<string, string>();
  for (const entry of Object.values(manifest.languages)) {
    fileToSource.set(entry.file, join(root, entry.sourcePath));
  }
  return {
    grammarRuntime: {
      init: () => Parser.init(),
      loadLanguage: (wasm: Uint8Array) => Language.load(wasm),
      createParser(grammar: object) {
        const parser = new Parser();
        parser.setLanguage(grammar as InstanceType<typeof Language>);
        return parser;
      },
    },
    filesystem: {
      async readFileBytes(path: string): Promise<Uint8Array> {
        if (path.endsWith("grammar-manifest.json")) {
          return new Uint8Array(readFileSync(manifestPath));
        }
        const fileName = path.split("/").pop() ?? "";
        const sourcePath = fileToSource.get(fileName);
        if (sourcePath !== undefined) {
          return new Uint8Array(readFileSync(sourcePath));
        }
        throw new Error(`ENOENT: unexpected grammar filesystem read: ${path}`);
      },
    },
  };
}

describe("E-ASM3 local-state, scheduling and capture-stability capabilities behind the factory", () => {
  it("index-snapshot working-tree and diffs execute through the factory with fake protection ports and deliver fenced private batches", async () => {
    const box = createSandbox();
    const plain = box.init(join(box.root, "local-worktree"));
    writeFileSync(join(plain, "src-app.ts"), "export function greet() { return 'v1'; }\n");
    writeFileSync(join(plain, "keep.ts"), "export const stable = 1;\n");
    box.git(plain, ["add", "--", "src-app.ts", "keep.ts"]);
    box.git(plain, ["commit", "-q", "-m", "base"]);

    // Stage a real edit and add a protected .env file + an unstaged working-tree edit.
    const stagedCode = "export function greet() { return 'v2-staged-private-hunk'; }\n";
    writeFileSync(join(plain, "src-app.ts"), stagedCode);
    box.git(plain, ["add", "--", "src-app.ts"]);
    writeFileSync(join(plain, "src-app.ts"), "export function greet() { return 'v3-unstaged-private-hunk'; }\n");
    writeFileSync(join(plain, ".env"), "SECRET_API_KEY=ghp_synthetic0123456789abcdefghijEASM3\n");

    const digestBefore = inventoryDigest({ root: plain });
    const commonDir = realpathSync(join(plain, ".git"));
    const mainGitDir = box.git(plain, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
    const hooksDir = join(box.root, "disabled-hooks");
    const repository = observeRepository({
      hostScope: "host:easm3-local",
      commonDirRealpath: commonDir,
      commonDirProjectFingerprint: "ws:easm3-local",
      oidAlgorithm: "sha1",
      worktrees: [
        {
          worktreePath: plain,
          gitDir: mainGitDir,
          worktreeFingerprint: "wtfp:easm3-main",
          head: { kind: "branch", refName: "refs/heads/main" },
        },
      ],
    });
    const mainWt = repository.worktrees[0]!.identity;
    const declId = deriveDeclarationIdentity({
      hostScope: "host:easm3-local",
      clone: repository.clone,
      worktree: mainWt,
    });
    const declaration: WorkspaceDeclarationDto = {
      tenant: "local:easm3-owner",
      principal: "local:easm3-principal",
      hostFingerprint: "hostfp:easm3",
      identityUncertainty: [],
      declarationId: declId.declarationId,
      cloneId: repository.clone.cloneId,
      worktreeId: mainWt.worktreeId,
      authorizedRoots: [plain],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
      declarationRevision: 1,
    };
    const privateScope: LiveScope = {
      tenant: declaration.tenant,
      clone: declaration.cloneId,
      worktree: declaration.worktreeId,
    };
    const worktreeToken: ScopeFencingTokenDto = {
      tokenId: "tok:easm3-wt-001",
      scope: privateScope,
      epoch: 1,
      epochId: "epoch:wt-001",
      declarationRevision: declaration.declarationRevision,
      projectionIncarnation: "inc:easm3-001",
      issuedAt: FIXTURE_NOW - 10_000,
      expiresAt: FIXTURE_NOW + 60_000,
    };

    const protection = new FakeLocalProtectionPort();
    const keyProvider = new FakeLocalKeyProvider();
    const latestStore = new FakeLatestSnapshotStore();
    const sink = new FakePrivateFencedSink();

    const syntheticSecret = "ghp_synthetic0123456789abcdefghijEASM3";
    const privateAllowedLine = "+export const privateMarker = 'PRIVATE_ALLOWED_HUNK_PLAIN_EASM3';";

    const factory = createLiveFactory({
      declaration,
      ports: {
        ...makeNoopAuxPorts(),
        git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir },
        content: { protection, keyProvider, latestSnapshots: latestStore },
        factSink: sink,
      } as unknown as LiveFactoryPorts,
    });

    // 1. All 10 capabilities reported available by single source of truth.
    expect(factory.describeCapabilities()).toEqual(describeCapabilities());
    expect(factory.describeCapabilities()).toHaveLength(10);
    expect(factory.describeCapabilities().filter((c) => c.state === "available").map((c) => c.capability)).toEqual([
      ...CAPABILITY_IDS,
    ]);

    // 2. index-snapshot executes L4a + L4b and delivers a fenced private sealed batch.
    const indexRes = await factory.runCapability("index-snapshot", {
      cwd: plain,
      generationId: formatProducerGenerationId(1),
      fencingToken: worktreeToken,
      expectedIncarnation: worktreeToken.projectionIncarnation,
      hunkDrafts: [
        {
          path: encUtf8("src-app.ts"),
          startBefore: 1,
          countBefore: 1,
          startAfter: 1,
          countAfter: 1,
          lines: [privateAllowedLine],
        },
        {
          path: encUtf8("src-app.ts"),
          startBefore: 2,
          countBefore: 1,
          startAfter: 2,
          countAfter: 1,
          lines: [`+const secret = "${syntheticSecret}";`],
        },
      ],
    } as never) as unknown as Record<string, unknown>;
    expect(indexRes.state, JSON.stringify(indexRes)).toBe("available");
    expect(indexRes.delivered).toBe(true);
    expect((indexRes.capture as { stable: boolean }).stable).toBe(true);
    const indexDiff = indexRes.diff as LocalDiffDto;
    expect(indexDiff.kind).toBe("staged");
    expect(indexDiff.base.label).toBe("HEAD");
    expect(indexDiff.tip.label).toBe("index");
    expect(validateSealedLocalDiff(indexDiff).ok).toBe(true);
    const indexSnap = indexRes.snapshot as LocalSnapshotDto;
    expect(indexSnap.kind).toBe("index");
    expect(indexSnap.sealed.state).toBe("sealed");
    expect(validateLocalSnapshot(indexSnap).ok).toBe(true);
    expect(protection.calls.length).toBeGreaterThanOrEqual(2);
    expect(sink.deliveries).toHaveLength(1);
    expect(sink.deliveries[0]!.fencingToken).toEqual(worktreeToken);
    expect(sink.deliveries[0]!.batch.policyVersion).toBe(CONTENT_POLICY_VERSION);
    expect(sink.deliveries[0]!.batch.facts.map((f) => classifyLiveFactKind(f))).toEqual([
      "local-diff",
      "local-snapshot",
      "local-coverage",
    ]);

    // 3. working-tree executes L4a + L4b and delivers a distinct unstaged fenced private batch.
    const wtRes = await factory.runCapability("working-tree", {
      cwd: plain,
      generationId: formatProducerGenerationId(2),
      fencingToken: worktreeToken,
      expectedIncarnation: worktreeToken.projectionIncarnation,
    } as never) as unknown as Record<string, unknown>;
    expect(wtRes.state, JSON.stringify(wtRes)).toBe("available");
    expect(wtRes.delivered).toBe(true);
    expect((wtRes.capture as { stable: boolean }).stable).toBe(true);
    const wtDiff = wtRes.diff as LocalDiffDto;
    expect(wtDiff.kind).toBe("unstaged");
    expect(wtDiff.base.label).toBe("index");
    expect(wtDiff.tip.label).toBe("worktree");
    const envFile = wtDiff.files.find((f) => f.exclusion === "protected");
    expect(envFile).toBeDefined();
    expect(new TextDecoder().decode(envFile!.path)).toMatch(/^withheld-path:[0-9a-f]{64}$/);
    expect((wtRes.snapshot as LocalSnapshotDto).kind).toBe("working-tree");
    expect((wtRes.snapshot as LocalSnapshotDto).sealed.state).toBe("sealed");
    expect(sink.deliveries).toHaveLength(2);
    expect(sink.deliveries[1]!.fencingToken).toEqual(worktreeToken);

    // 4. diffs executes staged, unstaged and conflict diffs with separate conflict stages 1/2/3.
    const idxEndpoint: LocalDiffEndpointDto = { label: "index", oid: "b".repeat(40) };
    const conflictEntries = [
      { path: encUtf8("src/clash.ts"), mode: "100644", oid: "1".repeat(40), stage: 1, kind: "file" as const, size: 64, isBinary: false },
      { path: encUtf8("src/clash.ts"), mode: "100644", oid: "2".repeat(40), stage: 2, kind: "file" as const, size: 64, isBinary: false },
      { path: encUtf8("src/clash.ts"), mode: "100644", oid: "3".repeat(40), stage: 3, kind: "file" as const, size: 64, isBinary: false },
    ];
    const diffRes = await factory.runCapability("diffs", {
      kind: "conflict",
      base: idxEndpoint,
      tip: idxEndpoint,
      baseEntries: conflictEntries,
      tipEntries: conflictEntries,
      conflictStages: [
        { path: encUtf8("src/clash.ts"), baseOid: "1".repeat(40), oursOid: "2".repeat(40), theirsOid: "3".repeat(40) },
      ],
      hunkDrafts: [
        {
          path: encUtf8("src/clash.ts"),
          startBefore: 1,
          countBefore: 1,
          startAfter: 1,
          countAfter: 1,
          lines: [privateAllowedLine],
        },
      ],
      generationId: formatProducerGenerationId(3),
      fencingToken: worktreeToken,
      expectedIncarnation: worktreeToken.projectionIncarnation,
    } as never) as unknown as Record<string, unknown>;
    expect(diffRes.state, JSON.stringify(diffRes)).toBe("available");
    expect(diffRes.delivered).toBe(true);
    const conflictDiff = diffRes.diff as LocalDiffDto;
    expect(conflictDiff.kind).toBe("conflict");
    expect(conflictDiff.files[0]?.stageOids).toEqual({
      "1": "1".repeat(40),
      "2": "2".repeat(40),
      "3": "3".repeat(40),
    });
    expect(sink.deliveries).toHaveLength(3);

    // 5. Missing key provider drives explicit metadata-only downgrade with ZERO protect calls.
    const protectCallsBeforeNoKey = protection.calls.length;
    keyProvider.available = false;
    const noKeyRes = await factory.runCapability("diffs", {
      kind: "unstaged",
      base: idxEndpoint,
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [
        { path: encUtf8("src/local.ts"), mode: "100644", oid: "d".repeat(40), stage: 0, kind: "file" as const, size: 48, isBinary: false },
      ],
      hunkDrafts: [
        {
          path: encUtf8("src/local.ts"),
          startBefore: 1,
          countBefore: 0,
          startAfter: 1,
          countAfter: 1,
          lines: [privateAllowedLine],
        },
      ],
      generationId: formatProducerGenerationId(4),
      fencingToken: worktreeToken,
    } as never) as unknown as Record<string, unknown>;
    expect(noKeyRes.state, JSON.stringify(noKeyRes)).toBe("available");
    expect(protection.calls.length).toBe(protectCallsBeforeNoKey);
    expect((noKeyRes.snapshot as LocalSnapshotDto).sealed).toEqual({
      state: "metadata-only",
      reason: "metadata:no-key",
    });
    expect((noKeyRes.coverage as { reason: string; cause?: string }).reason).toContain(CONTENT_UNAVAILABLE);
    expect((noKeyRes.coverage as { cause?: string }).cause).toBe("missing-key");
    keyProvider.available = true;

    // 6. Clone-scoped token (missing worktree) or missing content port fails closed with 0 new deliveries.
    const deliveriesBeforeRefusals = sink.deliveries.length;
    const cloneOnlyToken: ScopeFencingTokenDto = {
      ...worktreeToken,
      scope: { tenant: declaration.tenant, clone: declaration.cloneId },
    };
    const badTokenRes = await factory.runCapability("working-tree", {
      cwd: plain,
      generationId: formatProducerGenerationId(5),
      fencingToken: cloneOnlyToken,
    } as never);
    expect(badTokenRes).toMatchObject({ capability: "working-tree", state: "unavailable", delivered: false });
    expect(badTokenRes.reason).toMatch(/worktree|fencing/i);

    const noContentFactory = createLiveFactory({
      declaration,
      ports: {
        ...makeNoopAuxPorts(),
        git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir },
        factSink: sink,
      } as unknown as LiveFactoryPorts,
    });
    const noContentRes = await noContentFactory.runCapability("index-snapshot", {
      cwd: plain,
      generationId: formatProducerGenerationId(6),
      fencingToken: worktreeToken,
    } as never);
    expect(noContentRes).toMatchObject({ capability: "index-snapshot", state: "unavailable", delivered: false });
    expect(noContentRes.reason).toMatch(/content|snapshot|protection/i);
    expect(sink.deliveries).toHaveLength(deliveriesBeforeRefusals);

    // 7. Zero plaintext private content or secrets anywhere in batches, store, results or diagnostics.
    const allEmittedText = collectAllStrings([
      sink.deliveries.map((d) => d.batch),
      latestStore.stored,
      indexRes,
      wtRes,
      diffRes,
      noKeyRes,
    ]);
    const leaks = scanValuesForLeak(allEmittedText, [
      syntheticSecret,
      privateAllowedLine,
      "PRIVATE_ALLOWED_HUNK_PLAIN_EASM3",
      "v2-staged-private-hunk",
      "v3-unstaged-private-hunk",
      ".env",
    ]);
    expect(leaks).toEqual([]);

    // 8. Canonical codec round-trip on every delivered private batch and worktree immutability.
    for (const delivery of sink.deliveries) {
      const encoded = encodeFactBatch(delivery.batch);
      const decoded = decodeFactBatch(encoded.bytes);
      expect(decoded.batchDigest).toBe(delivery.batch.batchDigest);
    }
    expect(inventoryDigest({ root: plain })).toBe(digestBefore);
  });

  it("reconciliation and publication run the scheduler under injected watch and clock ports and stop on a revoked token", async () => {
    const box = createSandbox();
    const { declaration } = buildL0Setup(box);
    const worktreeScope: LiveScope = {
      tenant: declaration.tenant,
      clone: declaration.cloneId,
      worktree: declaration.worktreeId,
    };

    const clock = makeFakeScheduleClock(FIXTURE_NOW);
    const watch = new TestWatchPort(clock);
    const authority = new TestWriterAuthority(clock, worktreeScope, declaration.declarationRevision, () => world.incarnationId);
    const world = new TestSchedulingWorld(clock, authority);
    world.sourceFiles.set("src/a.ts", "export const a = 1;\n");
    world.sourceFiles.set("src/b.ts", "export const b = 2;\n");

    const sink = new FakePrivateFencedSink();
    sink.validateToken = (token) => authority.validate(token);

    const completionCalls: GenerationCompletionMessageDto[] = [];
    const generationCompletion: GenerationCompletionPort = {
      async complete(message: GenerationCompletionMessageDto, fencingToken: ScopeFencingTokenDto): Promise<GenerationCompletionOutcomeDto> {
        if (!authority.validate(fencingToken)) {
          throw new Error("FENCING_REJECTED: revoked token at completion port");
        }
        completionCalls.push(message);
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
          storageGenerationId: `sgen:${String(completionCalls.length).padStart(6, "0")}`,
          storeIncarnation: world.incarnationId,
          pointerVersion: completionCalls.length,
          publicationReceiptId: `pubrcpt:${String(completionCalls.length).padStart(6, "0")}`,
          publishedAt: clock.now(),
        };
      },
    };

    const factory = createLiveFactory({
      declaration,
      ports: {
        ...makeNoopAuxPorts(),
        clock,
        watch,
        scheduling: {
          writer: authority,
          markerStore: world.markerStore(),
          scan: world.scan(),
          pollRefs: world.pollRefs,
          durability: world.durability(),
        },
        generationCompletion,
        factSink: sink,
      } as unknown as LiveFactoryPorts,
    });

    // 1. Watch-before-scan: before watch is ready (bootstrapWatch: false), scan is refused.
    watch.autoReady = false;
    const unreadyRes = await factory.runCapability("reconciliation", {
      generationId: formatProducerGenerationId(1),
      action: "round",
      bootstrapWatch: false,
    } as never);
    expect(unreadyRes).toMatchObject({ capability: "reconciliation", state: "unavailable", delivered: false });
    expect(unreadyRes.reason).toMatch(/watch|ready/i);
    expect(world.fullScans).toBe(0);
    expect(sink.deliveries).toHaveLength(0);

    // 2. Watch becomes ready -> reconciliation runs through Scheduler and converges.
    watch.autoReady = true;
    const recRes = await factory.runCapability("reconciliation", {
      generationId: formatProducerGenerationId(2),
      action: "converge",
    } as never) as unknown as Record<string, unknown>;
    expect(recRes.state, JSON.stringify(recRes)).toBe("available");
    expect(recRes.delivered).toBe(true);
    expect(recRes.converged).toBe(true);
    expect(recRes.phase).toBe("current");
    expect(allCurrent(recRes.coverage as Parameters<typeof allCurrent>[0])).toBe(true);
    expect(world.dataMatchesSource()).toBe(true);
    expect(watch.starts).toBe(1);
    expect((recRes.ledger as { workReservedBytes: number }).workReservedBytes).toBe(0);
    expect(sink.deliveries.length).toBeGreaterThanOrEqual(1);
    expect(sink.deliveries.at(-1)!.batch.facts.some((f) => classifyLiveFactKind(f) === "progress")).toBe(true);
    expect(sink.deliveries.at(-1)!.batch.facts.some((f) => classifyLiveFactKind(f) === "coverage")).toBe(true);

    // 3. Scheduler runs independently of client lifetime: edit + clock advance converges on periodic timer.
    world.sourceFiles.set("src/c.ts", "export const c = 3;\n");
    watch.emit("change", ["src/c.ts"]);
    clock.advance(10_000);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(world.dataMatchesSource()).toBe(true);

    // 4. Publication executes through the shared Scheduler (L6b + L3a-E2 completion) with active token.
    const activeToken = authority.acquiredTokens.at(-1)!;
    const pubGenId = formatProducerGenerationId(3);
    const correlation = createGenerationCorrelation({
      producerGenerationId: pubGenId,
      policyVersion: CONTENT_POLICY_VERSION,
      view: "private",
      scope: worktreeScope,
      authorizingDeclaration: {
        declarationId: declaration.declarationId,
        cloneId: declaration.cloneId,
        worktreeId: declaration.worktreeId,
        declarationRevision: declaration.declarationRevision,
      },
      sourceBoundary: {
        view: "private",
        oidAlgorithm: "sha1",
        observedAt: clock.now(),
        worktreeId: declaration.worktreeId,
        headCommit: { algorithm: "sha1", oid: "a".repeat(40) },
        captureStable: true,
        snapshotIds: [`lsnap:${"c".repeat(64)}`],
        configAttributesFingerprint: sha256Text("config:v1"),
        contentFingerprintMode: "none",
      },
    });
    const fakeReceipt: BatchDeliveryReceiptDto = {
      controlVersion: GENERATION_CONTROL_VERSION,
      kind: "batch-receipt",
      received: true,
      published: false,
      completeBatch: true,
      producerGenerationId: pubGenId,
      batchId: "batch:priv-pub:000001",
      batchDigest: "d".repeat(64),
      receiptId: "rcpt:staged-000001",
      byteLength: 512,
      finalBatch: true,
      receivedAt: clock.now(),
    };
    const pubRes = await factory.runCapability("publication", {
      generationId: pubGenId,
      fencingToken: activeToken,
      expectedIncarnation: world.incarnationId,
      completion: {
        correlation,
        receipts: [fakeReceipt],
        input: {
          completionState: "complete",
          coverage: [{ axis: "working-tree", state: "current", reason: "verified", pendingCount: 0, complete: true }],
          exclusions: [],
          errors: [],
          remainingWork: 0,
          completedAt: clock.now(),
        },
      },
    } as never) as unknown as Record<string, unknown>;
    expect(pubRes.state, JSON.stringify(pubRes)).toBe("available");
    expect(pubRes.delivered).toBe(true);
    expect(pubRes.published).toBe(true);
    expect((pubRes.completionOutcome as GenerationCompletionOutcomeDto).status).toBe("published");
    expect(completionCalls).toHaveLength(1);

    // 5. Revoked token stops publication immediately with ZERO publishGeneration / completion / sink calls.
    const publishesBeforeRevoke = world.publishCalls;
    const completionsBeforeRevoke = completionCalls.length;
    const deliveriesBeforeRevoke = sink.deliveries.length;
    authority.revoke(activeToken);
    const revokedPubRes = await factory.runCapability("publication", {
      generationId: formatProducerGenerationId(4),
      fencingToken: activeToken,
      expectedIncarnation: world.incarnationId,
      completion: {
        correlation: createGenerationCorrelation({
          producerGenerationId: formatProducerGenerationId(4),
          policyVersion: correlation.policyVersion,
          view: correlation.view,
          scope: correlation.scope,
          authorizingDeclaration: correlation.authorizingDeclaration,
          sourceBoundary: correlation.sourceBoundary,
        }),
        receipts: [{ ...fakeReceipt, producerGenerationId: formatProducerGenerationId(4) }],
        input: {
          completionState: "complete",
          coverage: [{ axis: "working-tree", state: "current", reason: "verified", pendingCount: 0, complete: true }],
          exclusions: [],
          errors: [],
          remainingWork: 0,
          completedAt: clock.now(),
        },
      },
    } as never);
    expect(revokedPubRes).toMatchObject({ capability: "publication", state: "unavailable", delivered: false });
    expect(revokedPubRes.reason).toMatch(/revoked|fenced|token/i);
    expect(world.publishCalls).toBe(publishesBeforeRevoke);
    expect(completionCalls).toHaveLength(completionsBeforeRevoke);
    expect(sink.deliveries).toHaveLength(deliveriesBeforeRevoke);

    // 6. Token revoked MID-reconciliation halts immediately, publishes nothing and delivers 0 batches.
    world.sourceFiles.set("src/d.ts", "export const d = 4;\n");
    watch.emit("change", ["src/d.ts"]);
    const publishesBeforeMidRevoke = world.publishCalls;
    const deliveriesBeforeMidRevoke = sink.deliveries.length;
    world.onDuringCollect = (opts) => {
      authority.allowAcquire = false;
      authority.revoke(opts.fencingToken);
    };
    const midRevokedRec = await factory.runCapability("reconciliation", {
      generationId: formatProducerGenerationId(5),
      action: "converge",
    } as never);
    world.onDuringCollect = undefined;
    expect(midRevokedRec).toMatchObject({ capability: "reconciliation", state: "unavailable", delivered: false });
    expect(midRevokedRec.reason).toMatch(/revoked|fenced|writer/i);
    expect(world.publishCalls).toBe(publishesBeforeMidRevoke);
    expect(sink.deliveries).toHaveLength(deliveriesBeforeMidRevoke);

    // 7. Concurrent multi-scope scheduling shares one host-owned Scheduler within budgets.
    const sharedBudgets: SchedulerBudgets = {
      maxPendingPaths: 64,
      maxPendingBytes: 16 * 1024 * 1024,
      maxConcurrency: 4,
      maxActiveOperationsPerScope: 1,
      maxRetries: 2,
      retryBaseMs: 50,
      maxBackoffMs: 30_000,
      maxFailedKept: 8,
      maxConsumers: 32,
      maxFileSizeBytes: 1024 * 1024,
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
    };
    const sharedClock = makeFakeScheduleClock(FIXTURE_NOW);
    const scopeA: LiveScope = { tenant: declaration.tenant, clone: declaration.cloneId, worktree: "wt:shared-a" };
    const scopeB: LiveScope = { tenant: declaration.tenant, clone: declaration.cloneId, worktree: "wt:shared-b" };
    const authA = new TestWriterAuthority(sharedClock, scopeA, 1, () => worldA.incarnationId);
    const authB = new TestWriterAuthority(sharedClock, scopeB, 1, () => worldB.incarnationId);
    const worldA = new TestSchedulingWorld(sharedClock, authA);
    const worldB = new TestSchedulingWorld(sharedClock, authB);
    worldA.sourceFiles.set("a.ts", "export const a = 1;\n");
    worldB.sourceFiles.set("b.ts", "export const b = 2;\n");
    const sharedProgress = new Map<string, { attempts: number; receiptId?: string; digest: string; scopeId: string }>();
    const sharedScheduler = new Scheduler(
      {
        clock: sharedClock,
        sink: { deliver: async () => ({ ok: false, retryable: false }) },
        validateToken: (t) => authA.validate(t) || authB.validate(t),
        sleep: worldA.durability().sleep,
        park: () => {},
        readProgress: (item) => sharedProgress.get(item.id),
        writeProgress: (item, p) => {
          sharedProgress.set(item.id, { ...p, digest: item.idempotencyDigest, scopeId: item.scopeId });
        },
        backlogSize: () => 0,
      },
      sharedBudgets,
    );
    const sharedSink = new FakePrivateFencedSink();
    const factoryA = createLiveFactory({
      declaration: { ...declaration, worktreeId: "wt:shared-a" },
      ports: {
        ...makeNoopAuxPorts(),
        clock: sharedClock,
        watch: new TestWatchPort(sharedClock),
        scheduling: {
          scheduler: sharedScheduler,
          writer: authA,
          markerStore: worldA.markerStore(),
          scan: worldA.scan(),
          pollRefs: worldA.pollRefs,
        },
        factSink: sharedSink,
      } as unknown as LiveFactoryPorts,
    });
    const factoryB = createLiveFactory({
      declaration: { ...declaration, worktreeId: "wt:shared-b" },
      ports: {
        ...makeNoopAuxPorts(),
        clock: sharedClock,
        watch: new TestWatchPort(sharedClock),
        scheduling: {
          scheduler: sharedScheduler,
          writer: authB,
          markerStore: worldB.markerStore(),
          scan: worldB.scan(),
          pollRefs: worldB.pollRefs,
        },
        factSink: sharedSink,
      } as unknown as LiveFactoryPorts,
    });
    const [resA, resB] = await Promise.all([
      factoryA.runCapability("reconciliation", { generationId: formatProducerGenerationId(10), action: "converge" } as never),
      factoryB.runCapability("reconciliation", { generationId: formatProducerGenerationId(11), action: "converge" } as never),
    ]);
    expect(resA).toMatchObject({ capability: "reconciliation", state: "available", delivered: true, converged: true });
    expect(resB).toMatchObject({ capability: "reconciliation", state: "available", delivered: true, converged: true });
    expect(sharedScheduler.ledgerSnapshot().workReservedBytes).toBe(0);
    expect(sharedScheduler.lastStats()?.maxObservedConcurrency ?? 0).toBeLessThanOrEqual(sharedBudgets.maxConcurrency);

    // Clean shutdown releases all leases and resident reservations.
    await factory.runCapability("reconciliation", { generationId: formatProducerGenerationId(6), action: "shutdown" } as never);
    await factoryA.runCapability("reconciliation", { generationId: formatProducerGenerationId(12), action: "shutdown" } as never);
    await factoryB.runCapability("reconciliation", { generationId: formatProducerGenerationId(13), action: "shutdown" } as never);
    expect(sharedScheduler.ledgerSnapshot().workReservedBytes).toBe(0);
    expect(sharedScheduler.ledgerSnapshot().activeOperations).toBe(0);
  });

  it("a stable verified capture lets a local analysis reach complete and an unstable capture stays below complete", async () => {
    const box = createSandbox();
    const repo = box.init(join(box.root, "local-analysis-repo"));
    writeFileSync(join(repo, "local.ts"), "export function initial() { return 1; }\n");
    box.git(repo, ["add", "--", "local.ts"]);
    box.git(repo, ["commit", "-q", "-m", "initial"]);

    const uncommittedCode = "export function localProbe() { return 42; }\n";
    writeFileSync(join(repo, "local.ts"), uncommittedCode);
    const digestBefore = inventoryDigest({ root: repo });

    const commonDir = realpathSync(join(repo, ".git"));
    const mainGitDir = box.git(repo, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
    const hooksDir = join(box.root, "disabled-hooks");
    const repository = observeRepository({
      hostScope: "host:easm3-analysis",
      commonDirRealpath: commonDir,
      commonDirProjectFingerprint: "ws:easm3-analysis",
      oidAlgorithm: "sha1",
      worktrees: [
        {
          worktreePath: repo,
          gitDir: mainGitDir,
          worktreeFingerprint: "wtfp:easm3-analysis",
          head: { kind: "branch", refName: "refs/heads/main" },
        },
      ],
    });
    const mainWt = repository.worktrees[0]!.identity;
    const declId = deriveDeclarationIdentity({
      hostScope: "host:easm3-analysis",
      clone: repository.clone,
      worktree: mainWt,
    });
    const declaration: WorkspaceDeclarationDto = {
      tenant: "local:easm3-analysis",
      principal: "local:easm3-principal",
      hostFingerprint: "hostfp:easm3-analysis",
      identityUncertainty: [],
      declarationId: declId.declarationId,
      cloneId: repository.clone.cloneId,
      worktreeId: mainWt.worktreeId,
      authorizedRoots: [repo],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
      declarationRevision: 1,
    };
    const privateScope: LiveScope = {
      tenant: declaration.tenant,
      clone: declaration.cloneId,
      worktree: declaration.worktreeId,
    };
    const worktreeToken: ScopeFencingTokenDto = {
      tokenId: "tok:easm3-ana-001",
      scope: privateScope,
      epoch: 1,
      epochId: "epoch:ana-001",
      declarationRevision: 1,
      projectionIncarnation: "inc:ana-001",
      issuedAt: FIXTURE_NOW - 10_000,
      expiresAt: FIXTURE_NOW + 60_000,
    };

    const { grammarRuntime, filesystem } = makeSourceGrammarRuntime();
    const protection = new FakeLocalProtectionPort();
    const latestStore = new FakeLatestSnapshotStore();
    const sink = new FakePrivateFencedSink();

    const factory = createLiveFactory({
      declaration,
      ports: {
        git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir },
        filesystem,
        clock: { now: () => FIXTURE_NOW },
        content: { protection, latestSnapshots: latestStore },
        factSink: sink,
        grammarRuntime,
      } as unknown as LiveFactoryPorts,
    });

    const noopObjects: RetainedObjectsPort = {
      async loadObject() { return null; },
      async loadBlob() { return null; },
    };
    const configHash = sha256Text("tsconfig:v1");
    const dependencyHash = sha256Text("deps:v1");

    // 1. Run working-tree capture to obtain snapshotId and verified capture evidence.
    const wtRes = await factory.runCapability("working-tree", {
      cwd: repo,
      generationId: formatProducerGenerationId(1),
      fencingToken: worktreeToken,
    } as never) as unknown as Record<string, unknown>;
    expect(wtRes.state, JSON.stringify(wtRes)).toBe("available");
    const snapshotId = (wtRes.snapshot as LocalSnapshotDto).snapshotId;
    const verifiedCaptures = wtRes.verifiedCaptures as Record<string, Record<string, unknown>>;
    expect(verifiedCaptures["local.ts"]).toBeDefined();

    // 2. Stable live capture wired through factory lets local analysis reach complete!
    const liveStable = await factory.runCapability("code-analysis", {
      input: {
        scope: privateScope,
        language: "typescript",
        path: "local.ts",
        content: uncommittedCode,
        treeOid: null,
        snapshotId,
        snapshotKind: "working-tree",
        worktreeId: declaration.worktreeId,
        configHash,
        dependencyHash,
        historicalBounds: null,
      },
      objects: noopObjects,
      capture: { cwd: repo, snapshotKind: "working-tree" },
    } as never) as unknown as Record<string, unknown>;
    expect(liveStable.state, JSON.stringify(liveStable)).toBe("available");
    expect((liveStable.capture as { stable: boolean }).stable).toBe(true);
    expect(liveStable.analysis).toMatchObject({
      state: "complete",
      cacheMode: "no-cache",
      coverage: { axis: "ast", language: "typescript", state: "current" },
      declarationInventory: { kind: "verified-declaration-inventory" },
    });
    expect((liveStable.analysis as { symbols: { name: string }[] }).symbols).toContainEqual(
      expect.objectContaining({ name: "localProbe" }),
    );

    // 3. Verified capture evidence returned from working-tree also reaches complete.
    const fromEvidence = await factory.runCapability("code-analysis", {
      input: {
        scope: privateScope,
        language: "typescript",
        path: "local.ts",
        content: uncommittedCode,
        treeOid: null,
        snapshotId,
        snapshotKind: "working-tree",
        worktreeId: declaration.worktreeId,
        configHash,
        dependencyHash,
        historicalBounds: null,
        verifiedCapture: verifiedCaptures["local.ts"],
      },
      objects: noopObjects,
    } as never) as unknown as Record<string, unknown>;
    expect(fromEvidence.analysis).toMatchObject({
      state: "complete",
      declarationInventory: { kind: "verified-declaration-inventory" },
    });

    // 4. Unstable capture (file mutates on every attempt) stays below complete (partial + unstable-capture).
    let mutationCounter = 0;
    const liveUnstable = await factory.runCapability("code-analysis", {
      input: {
        scope: privateScope,
        language: "typescript",
        path: "local.ts",
        content: uncommittedCode,
        treeOid: null,
        snapshotId,
        snapshotKind: "working-tree",
        worktreeId: declaration.worktreeId,
        configHash,
        dependencyHash,
        historicalBounds: null,
      },
      objects: noopObjects,
      capture: {
        cwd: repo,
        snapshotKind: "working-tree",
        maxAttempts: 2,
        hooks: {
          betweenInventoryAndContent: () => {
            mutationCounter += 1;
            writeFileSync(join(repo, "local.ts"), `export function localProbe() { return ${42 + mutationCounter}; }\n`);
          },
        },
      },
    } as never) as unknown as Record<string, unknown>;
    // Restore file before further assertions.
    writeFileSync(join(repo, "local.ts"), uncommittedCode);
    expect(liveUnstable.state).toBe("available");
    expect((liveUnstable.capture as { stable: boolean }).stable).toBe(false);
    expect(liveUnstable.analysis).toMatchObject({
      state: "partial",
      coverage: { state: "partial", reason: expect.stringMatching(/^unstable-capture:/) },
    });
    expect((liveUnstable.analysis as { declarationInventory?: unknown }).declarationInventory).toBeUndefined();

    // 5. Evidence whose content fingerprint (or any bound field) differs stays below complete!
    const validEv = verifiedCaptures["local.ts"]!;
    const mismatches: Array<{ readonly label: string; readonly ev: unknown; readonly content?: string }> = [
      { label: "absent verifiedCapture (default preserved)", ev: undefined },
      { label: "different contentFingerprint", ev: { ...validEv, contentFingerprint: sha256Text("different bytes\n") } },
      { label: "modified analysed bytes against old evidence", ev: validEv, content: "export function localProbe() { return 999; }\n" },
      { label: "different path", ev: { ...validEv, path: "other.ts" } },
      { label: "different snapshotId", ev: { ...validEv, snapshotId: `lsnap:${"f".repeat(64)}` } },
      { label: "different worktreeId", ev: { ...validEv, worktreeId: "wt:other" } },
      { label: "different scope tenant", ev: { ...validEv, scope: { tenant: "local:other", clone: declaration.cloneId } } },
      { label: "different scope clone", ev: { ...validEv, scope: { tenant: declaration.tenant, clone: "clone:other" } } },
      { label: "bare stable flag without evidence fields", ev: { stable: true } },
      { label: "stable false", ev: { ...validEv, stable: false } },
      { label: "unknown extra key", ev: { ...validEv, extra: "forged" } },
    ];
    for (const testCase of mismatches) {
      const res = await factory.runCapability("code-analysis", {
        input: {
          scope: privateScope,
          language: "typescript",
          path: "local.ts",
          content: testCase.content ?? uncommittedCode,
          treeOid: null,
          snapshotId,
          snapshotKind: "working-tree",
          worktreeId: declaration.worktreeId,
          configHash,
          dependencyHash,
          historicalBounds: null,
          ...(testCase.ev !== undefined ? { verifiedCapture: testCase.ev } : {}),
        },
        objects: noopObjects,
      } as never) as unknown as Record<string, unknown>;
      expect(res.analysis, `mismatch case: ${testCase.label}`).toMatchObject({
        state: "partial",
        coverage: { state: "partial", reason: expect.stringMatching(/^unstable-capture:/) },
      });
      expect(
        (res.analysis as { declarationInventory?: unknown }).declarationInventory,
        `no inventory receipt for mismatch: ${testCase.label}`,
      ).toBeUndefined();
    }

    // Live capture whose disk bytes differ from input.content also stays below complete.
    const liveMismatch = await factory.runCapability("code-analysis", {
      input: {
        scope: privateScope,
        language: "typescript",
        path: "local.ts",
        content: "export function tampered() { return 0; }\n",
        treeOid: null,
        snapshotId,
        snapshotKind: "working-tree",
        worktreeId: declaration.worktreeId,
        configHash,
        dependencyHash,
        historicalBounds: null,
      },
      objects: noopObjects,
      capture: { cwd: repo, snapshotKind: "working-tree" },
    } as never) as unknown as Record<string, unknown>;
    expect(liveMismatch.analysis).toMatchObject({
      state: "partial",
      coverage: { state: "partial", reason: expect.stringMatching(/^unstable-capture:/) },
    });
    expect(inventoryDigest({ root: repo })).toBe(digestBefore);
  });

  // — Review round 1 regressions (REVIEW-lot-E-ASM3.md: F-01 through F-06).

  it("F-01: publication fails closed before lease acquisition, generation publication or completion on mismatched correlation or stale incarnation", async () => {
    const box = createSandbox();
    const { declaration } = buildL0Setup(box);
    const worktreeScope: LiveScope = {
      tenant: declaration.tenant,
      clone: declaration.cloneId,
      worktree: declaration.worktreeId,
    };
    const cloneScope: LiveScope = {
      tenant: declaration.tenant,
      clone: declaration.cloneId,
    };

    const clock = makeFakeScheduleClock(FIXTURE_NOW);
    const watch = new TestWatchPort(clock);
    const authority = new TestWriterAuthority(clock, worktreeScope, declaration.declarationRevision, () => world.incarnationId);
    const world = new TestSchedulingWorld(clock, authority);
    world.sourceFiles.set("src/a.ts", "export const a = 1;\n");
    world.projectedFiles.set("src/a.ts", "export const a = 1;\n");
    world.markers.set("live-checkpoint", "ckpt:ready");

    const sink = new FakePrivateFencedSink();
    const completionCalls: GenerationCompletionMessageDto[] = [];
    const generationCompletion: GenerationCompletionPort = {
      async complete(message: GenerationCompletionMessageDto): Promise<GenerationCompletionOutcomeDto> {
        completionCalls.push(message);
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
          storageGenerationId: `sgen:${String(completionCalls.length).padStart(6, "0")}`,
          storeIncarnation: world.incarnationId,
          pointerVersion: completionCalls.length,
          publicationReceiptId: `pubrcpt:${String(completionCalls.length).padStart(6, "0")}`,
          publishedAt: clock.now(),
        };
      },
    };

    // Permissive writer wrapper for private-view cross-declaration subtest: accepts foreign tokens so
    // only factory-local's declaration binding check can reject mismatched scope/authorizingDeclaration.
    let acceptForeignTokenId: string | undefined;
    const writerWithForeignToggle: WriterAuthority = {
      acquire: (req) => authority.acquire(req),
      renew: (tok) => authority.renew(tok),
      validate: (tok) => (acceptForeignTokenId !== undefined && tok.tokenId === acceptForeignTokenId) || authority.validate(tok),
      revoke: (tok) => authority.revoke(tok),
      release: (tok) => authority.release(tok),
    };

    const factory = createLiveFactory({
      declaration,
      ports: {
        ...makeNoopAuxPorts(),
        clock,
        watch,
        scheduling: {
          writer: writerWithForeignToggle,
          markerStore: world.markerStore(),
          scan: world.scan(),
          pollRefs: world.pollRefs,
          durability: world.durability(),
        },
        generationCompletion,
        factSink: sink,
      } as unknown as LiveFactoryPorts,
    });

    const makeReceipt = (genId: string): BatchDeliveryReceiptDto => ({
      controlVersion: GENERATION_CONTROL_VERSION,
      kind: "batch-receipt",
      received: true,
      published: false,
      completeBatch: true,
      producerGenerationId: genId,
      batchId: "batch:f01:000001",
      batchDigest: "d".repeat(64),
      receiptId: "rcpt:f01-000001",
      byteLength: 256,
      finalBatch: true,
      receivedAt: clock.now(),
    });
    const makeCompletionInput = () => ({
      completionState: "complete" as const,
      coverage: [{ axis: "working-tree" as const, state: "current" as const, reason: "verified", pendingCount: 0, complete: true }],
      exclusions: [],
      errors: [],
      remainingWork: 0,
      completedAt: clock.now(),
    });

    // 1a. Committed-view completion with foreign cloneId/declarationId/worktreeId: zero acquire, publish or complete calls.
    const foreignCloneId = "clone:foreign999";
    const foreignDeclId = "decl:foreign999";
    const foreignWorktreeId = "wt:foreign999";
    const genForeignCommitted = formatProducerGenerationId(101);
    const foreignCommittedCorr = createGenerationCorrelation({
      producerGenerationId: genForeignCommitted,
      policyVersion: POLICY_VERSION,
      view: "committed",
      scope: { tenant: declaration.tenant, clone: foreignCloneId },
      authorizingDeclaration: {
        declarationId: foreignDeclId,
        cloneId: foreignCloneId,
        worktreeId: foreignWorktreeId,
        declarationRevision: declaration.declarationRevision,
      },
      sourceBoundary: {
        view: "committed",
        oidAlgorithm: "sha1",
        observedAt: clock.now(),
        refsFingerprint: sha256Text("refs:foreign"),
        headCommit: { algorithm: "sha1", oid: "a".repeat(40) },
        rootOids: [{ algorithm: "sha1", oid: "a".repeat(40) }],
        configAttributesFingerprint: sha256Text("cfg:foreign"),
        completeHistoryFrontier: true,
      },
    });
    const foreignCommittedToken: ScopeFencingTokenDto = {
      tokenId: "tok:f01-foreign-committed",
      scope: { tenant: declaration.tenant, clone: foreignCloneId },
      epoch: 1,
      epochId: "epoch:foreign-1",
      declarationRevision: declaration.declarationRevision,
      projectionIncarnation: world.incarnationId,
      issuedAt: clock.now() - 1_000,
      expiresAt: clock.now() + 60_000,
    };
    const resForeignCommitted = await factory.runCapability("publication", {
      generationId: genForeignCommitted,
      fencingToken: foreignCommittedToken,
      expectedIncarnation: world.incarnationId,
      completion: {
        correlation: foreignCommittedCorr,
        receipts: [makeReceipt(genForeignCommitted)],
        input: makeCompletionInput(),
      },
    } as never);
    expect(resForeignCommitted).toMatchObject({ capability: "publication", state: "unavailable", delivered: false });
    expect(authority.acquiredTokens).toHaveLength(0);
    expect(world.publishCalls).toBe(0);
    expect(completionCalls).toHaveLength(0);
    expect(sink.deliveries).toHaveLength(0);

    // 1b. Committed-view completion sharing cloneId/tenant but with mismatched authorizingDeclaration.declarationId / worktreeId / declarationRevision.
    for (const badDecl of [
      { ...declaration, declarationId: foreignDeclId },
      { ...declaration, worktreeId: foreignWorktreeId },
      { ...declaration, declarationRevision: declaration.declarationRevision + 1 },
    ]) {
      const genBadDecl = formatProducerGenerationId(102 + badDecl.declarationRevision);
      const badDeclCorr = createGenerationCorrelation({
        producerGenerationId: genBadDecl,
        policyVersion: POLICY_VERSION,
        view: "committed",
        scope: cloneScope,
        authorizingDeclaration: {
          declarationId: badDecl.declarationId,
          cloneId: badDecl.cloneId,
          worktreeId: badDecl.worktreeId,
          declarationRevision: badDecl.declarationRevision,
        },
        sourceBoundary: {
          view: "committed",
          oidAlgorithm: "sha1",
          observedAt: clock.now(),
          refsFingerprint: sha256Text("refs:bad-decl"),
          headCommit: { algorithm: "sha1", oid: "a".repeat(40) },
          rootOids: [{ algorithm: "sha1", oid: "a".repeat(40) }],
          configAttributesFingerprint: sha256Text("cfg:bad-decl"),
          completeHistoryFrontier: true,
        },
      });
      const tokForBadDecl: ScopeFencingTokenDto = {
        tokenId: `tok:f01-bad-decl-${genBadDecl}`,
        scope: cloneScope,
        epoch: 1,
        epochId: "epoch:bad-decl",
        declarationRevision: badDecl.declarationRevision,
        projectionIncarnation: world.incarnationId,
        issuedAt: clock.now() - 1_000,
        expiresAt: clock.now() + 60_000,
      };
      const resBadDecl = await factory.runCapability("publication", {
        generationId: genBadDecl,
        fencingToken: tokForBadDecl,
        expectedIncarnation: world.incarnationId,
        completion: {
          correlation: badDeclCorr,
          receipts: [makeReceipt(genBadDecl)],
          input: makeCompletionInput(),
        },
      } as never);
      expect(resBadDecl).toMatchObject({ capability: "publication", state: "unavailable", delivered: false });
      expect(authority.acquiredTokens).toHaveLength(0);
      expect(world.publishCalls).toBe(0);
      expect(completionCalls).toHaveLength(0);
      expect(sink.deliveries).toHaveLength(0);
    }

    // 1c. Private-view completion sharing cloneId with mismatched tenant or worktreeId (even if writer accepts the token): fail closed before side effects.
    const genForeignPriv = formatProducerGenerationId(106);
    const foreignPrivScope: LiveScope = {
      tenant: "local:other-tenant",
      clone: declaration.cloneId,
      worktree: foreignWorktreeId,
    };
    const foreignPrivCorr = createGenerationCorrelation({
      producerGenerationId: genForeignPriv,
      policyVersion: CONTENT_POLICY_VERSION,
      view: "private",
      scope: foreignPrivScope,
      authorizingDeclaration: {
        declarationId: declaration.declarationId,
        cloneId: declaration.cloneId,
        worktreeId: foreignWorktreeId,
        declarationRevision: declaration.declarationRevision,
      },
      sourceBoundary: {
        view: "private",
        oidAlgorithm: "sha1",
        observedAt: clock.now(),
        worktreeId: foreignWorktreeId,
        headCommit: { algorithm: "sha1", oid: "a".repeat(40) },
        captureStable: true,
        snapshotIds: [`lsnap:${"c".repeat(64)}`],
        configAttributesFingerprint: sha256Text("cfg:priv-foreign"),
        contentFingerprintMode: "none",
      },
    });
    const foreignPrivToken: ScopeFencingTokenDto = {
      tokenId: "tok:f01-foreign-private",
      scope: foreignPrivScope,
      epoch: 1,
      epochId: "epoch:priv-foreign",
      declarationRevision: declaration.declarationRevision,
      projectionIncarnation: world.incarnationId,
      issuedAt: clock.now() - 1_000,
      expiresAt: clock.now() + 60_000,
    };
    acceptForeignTokenId = foreignPrivToken.tokenId;
    const resForeignPriv = await factory.runCapability("publication", {
      generationId: genForeignPriv,
      fencingToken: foreignPrivToken,
      expectedIncarnation: world.incarnationId,
      completion: {
        correlation: foreignPrivCorr,
        receipts: [makeReceipt(genForeignPriv)],
        input: makeCompletionInput(),
      },
    } as never);
    acceptForeignTokenId = undefined;
    expect(resForeignPriv).toMatchObject({ capability: "publication", state: "unavailable", delivered: false });
    expect(world.publishCalls).toBe(0);
    expect(completionCalls).toHaveLength(0);
    expect(sink.deliveries).toHaveLength(0);

    // 2. Omitted expectedIncarnation with stale fencingToken.projectionIncarnation !== markerStore.incarnation():
    //    must reject BEFORE acquiring a lease, publishing a generation, or calling completionPort.complete.
    const genStaleInc = formatProducerGenerationId(107);
    const matchingCommittedCorr = createGenerationCorrelation({
      producerGenerationId: genStaleInc,
      policyVersion: POLICY_VERSION,
      view: "committed",
      scope: cloneScope,
      authorizingDeclaration: {
        declarationId: declaration.declarationId,
        cloneId: declaration.cloneId,
        worktreeId: declaration.worktreeId,
        declarationRevision: declaration.declarationRevision,
      },
      sourceBoundary: {
        view: "committed",
        oidAlgorithm: "sha1",
        observedAt: clock.now(),
        refsFingerprint: sha256Text("refs:stale-inc"),
        headCommit: { algorithm: "sha1", oid: "a".repeat(40) },
        rootOids: [{ algorithm: "sha1", oid: "a".repeat(40) }],
        configAttributesFingerprint: sha256Text("cfg:stale-inc"),
        completeHistoryFrontier: true,
      },
    });
    const staleIncarnationToken: ScopeFencingTokenDto = {
      tokenId: "tok:f01-stale-inc",
      scope: cloneScope,
      epoch: 1,
      epochId: "epoch:stale-inc",
      declarationRevision: declaration.declarationRevision,
      projectionIncarnation: "inc:stale-old-000",
      issuedAt: clock.now() - 1_000,
      expiresAt: clock.now() + 60_000,
    };
    const resStaleInc = await factory.runCapability("publication", {
      generationId: genStaleInc,
      fencingToken: staleIncarnationToken,
      // expectedIncarnation intentionally omitted!
      completion: {
        correlation: matchingCommittedCorr,
        receipts: [makeReceipt(genStaleInc)],
        input: makeCompletionInput(),
      },
    } as never);
    expect(resStaleInc).toMatchObject({ capability: "publication", state: "unavailable", delivered: false });
    expect(resStaleInc.reason).toMatch(/incarnation|fencing/i);
    expect(authority.acquiredTokens).toHaveLength(0);
    expect(world.publishCalls).toBe(0);
    expect(completionCalls).toHaveLength(0);
    expect(sink.deliveries).toHaveLength(0);
  });

  it("F-02: committed-view publication waits for active worktree work before acquiring a lease and releases its lease in finally", async () => {
    const box = createSandbox();
    const { declaration } = buildL0Setup(box);
    const worktreeScope: LiveScope = {
      tenant: declaration.tenant,
      clone: declaration.cloneId,
      worktree: declaration.worktreeId,
    };
    const cloneScope: LiveScope = {
      tenant: declaration.tenant,
      clone: declaration.cloneId,
    };

    const clock = makeFakeScheduleClock(FIXTURE_NOW);
    const watch = new TestWatchPort(clock);
    const authority = new TestWriterAuthority(clock, worktreeScope, declaration.declarationRevision, () => world.incarnationId);
    const world = new TestSchedulingWorld(clock, authority);
    world.sourceFiles.set("src/a.ts", "export const a = 1;\n");
    world.projectedFiles.set("src/a.ts", "export const a = 1;\n");
    world.markers.set("live-checkpoint", "ckpt:f02");

    const sharedBudgets: SchedulerBudgets = {
      maxPendingPaths: 64,
      maxPendingBytes: 16 * 1024 * 1024,
      maxConcurrency: 4,
      maxActiveOperationsPerScope: 1,
      maxRetries: 2,
      retryBaseMs: 50,
      maxBackoffMs: 30_000,
      maxFailedKept: 8,
      maxConsumers: 32,
      maxFileSizeBytes: 1024 * 1024,
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
    };
    const sharedScheduler = new Scheduler(
      {
        clock,
        sink: { deliver: async () => ({ ok: false, retryable: false }) },
        validateToken: (t) => authority.validate(t),
        sleep: world.durability().sleep,
        park: world.durability().park,
        readProgress: world.durability().readProgress,
        writeProgress: world.durability().writeProgress,
        backlogSize: world.durability().backlogSize,
      },
      sharedBudgets,
    );

    const sink = new FakePrivateFencedSink();
    let rejectNextCompletion = false;
    const generationCompletion: GenerationCompletionPort = {
      async complete(message: GenerationCompletionMessageDto): Promise<GenerationCompletionOutcomeDto> {
        if (rejectNextCompletion) {
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
            rejectionCode: "incomplete-batches",
            reason: "forced rejection to verify lease release",
            rejectedAt: clock.now(),
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
          storageGenerationId: "sgen:000001",
          storeIncarnation: world.incarnationId,
          pointerVersion: 1,
          publicationReceiptId: "pubrcpt:000001",
          publishedAt: clock.now(),
        };
      },
    };

    const factory = createLiveFactory({
      declaration,
      ports: {
        ...makeNoopAuxPorts(),
        clock,
        watch,
        scheduling: {
          scheduler: sharedScheduler,
          writer: authority,
          markerStore: world.markerStore(),
          scan: world.scan(),
          pollRefs: world.pollRefs,
        },
        generationCompletion,
        factSink: sink,
      } as unknown as LiveFactoryPorts,
    });

    // Acquire an active worktree token and launch an in-flight scheduled work item on the same scope.
    const existingWtToken = (await authority.acquire({
      scope: worktreeScope,
      minEpoch: 1,
      declarationRevision: declaration.declarationRevision,
      projectionIncarnation: world.incarnationId,
    }))!;
    expect(authority.acquiredTokens).toHaveLength(1);

    let releaseInFlight!: () => void;
    const inFlightGate = new Promise<void>((resolve) => {
      releaseInFlight = resolve;
    });
    let workerStartedResolve!: () => void;
    const workerStarted = new Promise<void>((resolve) => {
      workerStartedResolve = resolve;
    });

    const activeWorkItem: WorkItem = {
      id: "wt-op:active-001",
      scopeId: scopeIdentity(existingWtToken),
      priority: "interactive",
      bytes: 16_384,
      fencingToken: existingWtToken,
      idempotencyDigest: sha256Text("wt-op:active-001"),
    };
    const inFlightPromise = sharedScheduler.execute(activeWorkItem, async (permit) => {
      workerStartedResolve();
      await inFlightGate;
      permit.check();
      return { ok: true, receiptId: "wt-rcpt:001" };
    });
    await workerStarted;

    const makeCommittedPubReq = (seq: number) => {
      const genId = formatProducerGenerationId(seq);
      const correlation = createGenerationCorrelation({
        producerGenerationId: genId,
        policyVersion: POLICY_VERSION,
        view: "committed",
        scope: cloneScope,
        authorizingDeclaration: {
          declarationId: declaration.declarationId,
          cloneId: declaration.cloneId,
          worktreeId: declaration.worktreeId,
          declarationRevision: declaration.declarationRevision,
        },
        sourceBoundary: {
          view: "committed",
          oidAlgorithm: "sha1",
          observedAt: clock.now(),
          refsFingerprint: sha256Text(`refs:f02-${seq}`),
          headCommit: { algorithm: "sha1", oid: "a".repeat(40) },
          rootOids: [{ algorithm: "sha1", oid: "a".repeat(40) }],
          configAttributesFingerprint: sha256Text("cfg:f02"),
          completeHistoryFrontier: true,
        },
      });
      const cloneToken: ScopeFencingTokenDto = {
        tokenId: `tok:f02-clone-${seq}`,
        scope: cloneScope,
        epoch: 1,
        epochId: `epoch:f02-${seq}`,
        declarationRevision: declaration.declarationRevision,
        projectionIncarnation: world.incarnationId,
        issuedAt: clock.now() - 1_000,
        expiresAt: clock.now() + 60_000,
      };
      return {
        generationId: genId,
        fencingToken: cloneToken,
        expectedIncarnation: world.incarnationId,
        completion: {
          correlation,
          receipts: [
            {
              controlVersion: GENERATION_CONTROL_VERSION,
              kind: "batch-receipt" as const,
              received: true as const,
              published: false as const,
              completeBatch: true as const,
              producerGenerationId: genId,
              batchId: `batch:f02:${String(seq).padStart(6, "0")}`,
              batchDigest: "e".repeat(64),
              receiptId: `rcpt:f02-${seq}`,
              byteLength: 256,
              finalBatch: true,
              receivedAt: clock.now(),
            },
          ],
          input: {
            completionState: "complete" as const,
            coverage: [{ axis: "refs" as const, state: "current" as const, reason: "verified", pendingCount: 0, complete: true }],
            exclusions: [],
            errors: [],
            remainingWork: 0,
            completedAt: clock.now(),
          },
        },
      };
    };

    // Start committed-view publication while the worktree task is active.
    const pubPromise = factory.runCapability("publication", makeCommittedPubReq(201) as never);
    // Give microtasks/event loop a tick so any premature acquire() would have already fired.
    await new Promise((resolve) => setTimeout(resolve, 15));

    // Active worktree token MUST NOT be prematurely revoked while its scheduler task is still running!
    expect(authority.validate(existingWtToken)).toBe(true);
    expect(authority.acquiredTokens).toHaveLength(1);

    // Let the active worktree task finish cleanly; both operations must succeed.
    releaseInFlight();
    const [inFlightRes, pubRes] = await Promise.all([inFlightPromise, pubPromise]);
    expect(inFlightRes).toEqual({ ok: true, receiptId: "wt-rcpt:001" });
    expect(pubRes).toMatchObject({ capability: "publication", state: "available", delivered: true, published: true });

    // Committed-view worktree lease MUST be released after publication completes (no leaked lease).
    expect(authority.acquiredTokens).toHaveLength(2);
    const firstLease = authority.acquiredTokens[1]!;
    expect(authority.releasedTokens).toContain(firstLease.tokenId);
    expect(authority.validate(firstLease)).toBe(false);

    // Lease MUST ALSO be released in finally when completion is rejected.
    rejectNextCompletion = true;
    const failedPubRes = await factory.runCapability("publication", makeCommittedPubReq(202) as never);
    expect(failedPubRes).toMatchObject({ capability: "publication", state: "unavailable", delivered: false });
    expect(authority.acquiredTokens).toHaveLength(3);
    const secondLease = authority.acquiredTokens[2]!;
    expect(authority.releasedTokens).toContain(secondLease.tokenId);
    expect(authority.validate(secondLease)).toBe(false);
  });

  it("F-03: buildVerifiedCaptureEvidence and result.verifiedCaptures exclude content-policy protected paths beyond .env/.pem/.key", async () => {
    const box = createSandbox();
    const repo = box.init(join(box.root, "f03-protected-paths"));
    mkdirSync(join(repo, "secrets"), { recursive: true });
    mkdirSync(join(repo, "nested", "credentials"), { recursive: true });
    writeFileSync(join(repo, "ok.ts"), "export const ok = 1;\n");
    writeFileSync(join(repo, "credentials.json"), '{"client":"test"}\n');
    writeFileSync(join(repo, "id_rsa"), "placeholder-key-file-body\n");
    writeFileSync(join(repo, "service-account.json"), '{"type":"svc"}\n');
    writeFileSync(join(repo, "secrets", "token.txt"), "non-matching-placeholder\n");
    writeFileSync(join(repo, "nested", "credentials", "app.ts"), "export const x = 2;\n");
    box.git(repo, ["add", "--", "ok.ts", "credentials.json", "id_rsa", "service-account.json", "secrets/token.txt", "nested/credentials/app.ts"]);
    box.git(repo, ["commit", "-q", "-m", "initial"]);

    const commonDir = realpathSync(join(repo, ".git"));
    const mainGitDir = box.git(repo, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
    const hooksDir = join(box.root, "disabled-hooks");
    const repository = observeRepository({
      hostScope: "host:f03",
      commonDirRealpath: commonDir,
      commonDirProjectFingerprint: "ws:f03",
      oidAlgorithm: "sha1",
      worktrees: [
        {
          worktreePath: repo,
          gitDir: mainGitDir,
          worktreeFingerprint: "wtfp:f03",
          head: { kind: "branch", refName: "refs/heads/main" },
        },
      ],
    });
    const mainWt = repository.worktrees[0]!.identity;
    const declId = deriveDeclarationIdentity({ hostScope: "host:f03", clone: repository.clone, worktree: mainWt });
    const declaration: WorkspaceDeclarationDto = {
      tenant: "local:f03",
      principal: "local:f03-principal",
      hostFingerprint: "hostfp:f03",
      identityUncertainty: [],
      declarationId: declId.declarationId,
      cloneId: repository.clone.cloneId,
      worktreeId: mainWt.worktreeId,
      authorizedRoots: [repo],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
      declarationRevision: 1,
    };
    const privateScope: LiveScope = { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId };
    const worktreeToken: ScopeFencingTokenDto = {
      tokenId: "tok:f03-001",
      scope: privateScope,
      epoch: 1,
      epochId: "epoch:f03",
      declarationRevision: 1,
      projectionIncarnation: "inc:f03",
      issuedAt: FIXTURE_NOW - 10_000,
      expiresAt: FIXTURE_NOW + 60_000,
    };
    const factory = createLiveFactory({
      declaration,
      ports: {
        ...makeNoopAuxPorts(),
        git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir },
        content: { protection: new FakeLocalProtectionPort(), latestSnapshots: new FakeLatestSnapshotStore() },
        factSink: new FakePrivateFencedSink(),
      } as unknown as LiveFactoryPorts,
    });

    const protectedPaths = [
      "credentials.json",
      "id_rsa",
      "service-account.json",
      "secrets/token.txt",
      "nested/credentials/app.ts",
    ];

    const wtRes = await factory.runCapability("working-tree", {
      cwd: repo,
      generationId: formatProducerGenerationId(1),
      fencingToken: worktreeToken,
    } as never) as unknown as Record<string, unknown>;
    expect(wtRes.state, JSON.stringify(wtRes)).toBe("available");
    const wtVerified = wtRes.verifiedCaptures as Record<string, unknown>;
    expect(wtVerified["ok.ts"]).toBeDefined();
    for (const p of protectedPaths) {
      expect(wtVerified[p], `working-tree verifiedCaptures must exclude ${p}`).toBeUndefined();
    }

    const idxRes = await factory.runCapability("index-snapshot", {
      cwd: repo,
      generationId: formatProducerGenerationId(2),
      fencingToken: worktreeToken,
    } as never) as unknown as Record<string, unknown>;
    expect(idxRes.state, JSON.stringify(idxRes)).toBe("available");
    const idxVerified = idxRes.verifiedCaptures as Record<string, unknown>;
    expect(idxVerified["ok.ts"]).toBeDefined();
    for (const p of protectedPaths) {
      expect(idxVerified[p], `index-snapshot verifiedCaptures must exclude ${p}`).toBeUndefined();
    }
    const emittedProtectedStrings = collectAllStrings([
      wtRes.verifiedCaptures,
      wtRes.capture,
      idxRes.verifiedCaptures,
      idxRes.capture,
    ]);
    expect(scanValuesForLeak(emittedProtectedStrings, protectedPaths)).toEqual([]);

    // Direct buildVerifiedCaptureEvidence must also refuse content-policy protected paths.
    const syntheticCapture = {
      stable: true as const,
      attempts: 1,
      root: repo,
      objectFormat: "sha1",
      headOid: "a".repeat(40),
      indexDigest: "b".repeat(64),
      attrFingerprint: "c".repeat(64),
      entries: [],
      files: [
        {
          path: Buffer.from("credentials.json", "utf8"),
          status: "present" as const,
          kind: "file" as const,
          fingerprint: "d".repeat(64),
          size: 16,
          blobVerified: true,
        },
      ],
    };
    const directEv = buildVerifiedCaptureEvidence({
      scope: { tenant: declaration.tenant, clone: declaration.cloneId },
      worktreeId: declaration.worktreeId,
      snapshotId: `lsnap:${"e".repeat(64)}`,
      path: "credentials.json",
      capture: syntheticCapture,
      snapshotKind: "working-tree",
    });
    expect(directEv).toBeUndefined();
  });

  it("F-04: index-snapshot, working-tree and diffs fail closed when plaintextPayload is not Uint8Array or null", async () => {
    const box = createSandbox();
    const repo = box.init(join(box.root, "f04-payload-guard"));
    writeFileSync(join(repo, "app.ts"), "export const v = 1;\n");
    box.git(repo, ["add", "--", "app.ts"]);
    box.git(repo, ["commit", "-q", "-m", "init"]);

    const commonDir = realpathSync(join(repo, ".git"));
    const mainGitDir = box.git(repo, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
    const hooksDir = join(box.root, "disabled-hooks");
    const repository = observeRepository({
      hostScope: "host:f04",
      commonDirRealpath: commonDir,
      commonDirProjectFingerprint: "ws:f04",
      oidAlgorithm: "sha1",
      worktrees: [
        {
          worktreePath: repo,
          gitDir: mainGitDir,
          worktreeFingerprint: "wtfp:f04",
          head: { kind: "branch", refName: "refs/heads/main" },
        },
      ],
    });
    const mainWt = repository.worktrees[0]!.identity;
    const declId = deriveDeclarationIdentity({ hostScope: "host:f04", clone: repository.clone, worktree: mainWt });
    const declaration: WorkspaceDeclarationDto = {
      tenant: "local:f04",
      principal: "local:f04-principal",
      hostFingerprint: "hostfp:f04",
      identityUncertainty: [],
      declarationId: declId.declarationId,
      cloneId: repository.clone.cloneId,
      worktreeId: mainWt.worktreeId,
      authorizedRoots: [repo],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
      declarationRevision: 1,
    };
    const privateScope: LiveScope = { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId };
    const worktreeToken: ScopeFencingTokenDto = {
      tokenId: "tok:f04-001",
      scope: privateScope,
      epoch: 1,
      epochId: "epoch:f04",
      declarationRevision: 1,
      projectionIncarnation: "inc:f04",
      issuedAt: FIXTURE_NOW - 10_000,
      expiresAt: FIXTURE_NOW + 60_000,
    };
    const protection = new FakeLocalProtectionPort();
    const latestStore = new FakeLatestSnapshotStore();
    const sink = new FakePrivateFencedSink();
    const factory = createLiveFactory({
      declaration,
      ports: {
        ...makeNoopAuxPorts(),
        git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir },
        content: { protection, latestSnapshots: latestStore },
        factSink: sink,
      } as unknown as LiveFactoryPorts,
    });

    const badPayloads: unknown[] = ["secret", 42, [1, 2, 3], { bytes: true }];
    let seq = 1;
    for (const badPayload of badPayloads) {
      const idxRes = await factory.runCapability("index-snapshot", {
        cwd: repo,
        generationId: formatProducerGenerationId(seq++),
        fencingToken: worktreeToken,
        plaintextPayload: badPayload,
      } as never);
      expect(idxRes).toMatchObject({ capability: "index-snapshot", state: "unavailable", delivered: false });
      expect(idxRes.reason).toMatch(/plaintextPayload|Uint8Array/i);

      const wtRes = await factory.runCapability("working-tree", {
        cwd: repo,
        generationId: formatProducerGenerationId(seq++),
        fencingToken: worktreeToken,
        plaintextPayload: badPayload,
      } as never);
      expect(wtRes).toMatchObject({ capability: "working-tree", state: "unavailable", delivered: false });
      expect(wtRes.reason).toMatch(/plaintextPayload|Uint8Array/i);

      const diffRes = await factory.runCapability("diffs", {
        kind: "staged",
        base: { label: "HEAD", oid: "1".repeat(40) },
        tip: { label: "index", oid: "2".repeat(40) },
        baseEntries: [],
        tipEntries: [],
        generationId: formatProducerGenerationId(seq++),
        fencingToken: worktreeToken,
        plaintextPayload: badPayload,
      } as never);
      expect(diffRes).toMatchObject({ capability: "diffs", state: "unavailable", delivered: false });
      expect(diffRes.reason).toMatch(/plaintextPayload|Uint8Array/i);
    }

    expect(protection.calls).toHaveLength(0);
    expect(latestStore.stored).toHaveLength(0);
    expect(latestStore.latest.size).toBe(0);
    expect(sink.deliveries).toHaveLength(0);

    // Positive control: explicit null and Uint8Array payloads still succeed.
    const okNullRes = await factory.runCapability("diffs", {
      kind: "staged",
      base: { label: "HEAD", oid: "1".repeat(40) },
      tip: { label: "index", oid: "2".repeat(40) },
      baseEntries: [],
      tipEntries: [],
      generationId: formatProducerGenerationId(seq++),
      fencingToken: worktreeToken,
      plaintextPayload: null,
    } as never);
    expect(okNullRes).toMatchObject({ capability: "diffs", state: "available", delivered: true });

    const okBytesRes = await factory.runCapability("working-tree", {
      cwd: repo,
      generationId: formatProducerGenerationId(seq++),
      fencingToken: worktreeToken,
      plaintextPayload: new Uint8Array([1, 2, 3]),
    } as never);
    expect(okBytesRes).toMatchObject({ capability: "working-tree", state: "available", delivered: true });
  });

  it("F-05: index-snapshot populates indexBlobFingerprints only from staged index entries, excluding git rm --cached files", async () => {
    const box = createSandbox();
    const repo = box.init(join(box.root, "f05-rm-cached"));
    const keptBody = "export const kept = 1;\n";
    const removedBody = "export const removedFromIndex = 2;\n";
    const modifiedStagedBody = "export const modified = 99;\n";
    writeFileSync(join(repo, "kept.ts"), keptBody);
    writeFileSync(join(repo, "unstaged-removed.ts"), removedBody);
    writeFileSync(join(repo, "modified.ts"), "export const modified = 1;\n");
    box.git(repo, ["add", "--", "kept.ts", "unstaged-removed.ts", "modified.ts"]);
    box.git(repo, ["commit", "-q", "-m", "initial"]);

    // Unstage unstaged-removed.ts (still in HEAD AND still present untracked on disk), stage modified.ts.
    box.git(repo, ["rm", "--cached", "--", "unstaged-removed.ts"]);
    writeFileSync(join(repo, "modified.ts"), modifiedStagedBody);
    box.git(repo, ["add", "--", "modified.ts"]);

    const commonDir = realpathSync(join(repo, ".git"));
    const mainGitDir = box.git(repo, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
    const hooksDir = join(box.root, "disabled-hooks");
    const repository = observeRepository({
      hostScope: "host:f05",
      commonDirRealpath: commonDir,
      commonDirProjectFingerprint: "ws:f05",
      oidAlgorithm: "sha1",
      worktrees: [
        {
          worktreePath: repo,
          gitDir: mainGitDir,
          worktreeFingerprint: "wtfp:f05",
          head: { kind: "branch", refName: "refs/heads/main" },
        },
      ],
    });
    const mainWt = repository.worktrees[0]!.identity;
    const declId = deriveDeclarationIdentity({ hostScope: "host:f05", clone: repository.clone, worktree: mainWt });
    const declaration: WorkspaceDeclarationDto = {
      tenant: "local:f05",
      principal: "local:f05-principal",
      hostFingerprint: "hostfp:f05",
      identityUncertainty: [],
      declarationId: declId.declarationId,
      cloneId: repository.clone.cloneId,
      worktreeId: mainWt.worktreeId,
      authorizedRoots: [repo],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
      declarationRevision: 1,
    };
    const privateScope: LiveScope = { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId };
    const worktreeToken: ScopeFencingTokenDto = {
      tokenId: "tok:f05-001",
      scope: privateScope,
      epoch: 1,
      epochId: "epoch:f05",
      declarationRevision: 1,
      projectionIncarnation: "inc:f05",
      issuedAt: FIXTURE_NOW - 10_000,
      expiresAt: FIXTURE_NOW + 60_000,
    };
    const factory = createLiveFactory({
      declaration,
      ports: {
        ...makeNoopAuxPorts(),
        git: { gitPath: box.trace.executable, disabledHooksDir: hooksDir },
        content: { protection: new FakeLocalProtectionPort(), latestSnapshots: new FakeLatestSnapshotStore() },
        factSink: new FakePrivateFencedSink(),
      } as unknown as LiveFactoryPorts,
    });

    const idxRes = await factory.runCapability("index-snapshot", {
      cwd: repo,
      generationId: formatProducerGenerationId(1),
      fencingToken: worktreeToken,
    } as never) as unknown as Record<string, unknown>;
    expect(idxRes.state, JSON.stringify(idxRes)).toBe("available");
    const verified = idxRes.verifiedCaptures as Record<string, { contentFingerprint: string; snapshotKind?: string }>;
    expect(verified["unstaged-removed.ts"]).toBeUndefined();
    expect(verified["kept.ts"]).toMatchObject({
      snapshotKind: "index",
      contentFingerprint: sha256Text(keptBody),
    });
    expect(verified["modified.ts"]).toMatchObject({
      snapshotKind: "index",
      contentFingerprint: sha256Text(modifiedStagedBody),
    });
  });

  it("F-06: direct analyzeCode rejects verifiedCapture when input.scope.worktree mismatches verifiedCapture.worktreeId", async () => {
    const content = "export function directCheck() { return 7; }\n";
    const contentFingerprint = sha256Text(content);
    const snapshotId = `lsnap:${"a".repeat(64)}`;
    const configHash = sha256Text("cfg:f06");
    const dependencyHash = sha256Text("deps:f06");

    const minimalWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const minimalWasmDigest = createHash("sha256").update(minimalWasm).digest("hex");

    const ports = {
      grammar: {
        status: () => ({
          state: "available" as const,
          version: "0.1.0",
          bytes: minimalWasm,
          digest: minimalWasmDigest,
          abi: "14",
          grammarId: "tree-sitter-typescript@0.1.0",
        }),
        load: () => ({ stubGrammar: true }),
      },
      objects: {
        async loadObject() { return null; },
        async loadBlob() { return null; },
      },
      extractor: {
        parse: () => ({
          symbols: [
            {
              slot: "fn:directCheck",
              name: "directCheck",
              kind: "function",
              bodyHash: sha256Text("body:directCheck"),
              startLine: 1,
              endLine: 1,
            },
          ],
          calls: [],
          inheritances: [],
          topologyHash: sha256Text("topo:f06"),
          syntax: {
            rootSpansBytes: true,
            hasError: false,
            hasMissing: false,
            walkComplete: true,
          },
        }),
      },
    };

    const verifiedCapture = {
      stable: true as const,
      scope: { tenant: "local:f06", clone: "clone:f06" },
      worktreeId: "wt:evidence-a",
      snapshotId,
      path: "src/direct.ts",
      contentFingerprint,
      indexDigest: "b".repeat(64),
      attrFingerprint: "c".repeat(64),
      attempts: 1,
      snapshotKind: "working-tree" as const,
    };

    // Mismatched input.scope.worktree must stay partial / unstable-capture even when input.worktreeId === ev.worktreeId.
    const mismatched = await analyzeCode(
      {
        scope: { tenant: "local:f06", clone: "clone:f06", worktree: "wt:other-scope" },
        language: "typescript",
        path: "src/direct.ts",
        content,
        treeOid: null,
        snapshotId,
        snapshotKind: "working-tree",
        worktreeId: "wt:evidence-a",
        configHash,
        dependencyHash,
        historicalBounds: null,
        verifiedCapture,
      },
      ports,
    );
    expect(mismatched.state).toBe("partial");
    expect(mismatched.coverage.reason).toMatch(/^unstable-capture:/);
    expect(mismatched.declarationInventory).toBeUndefined();

    // Positive control: matching input.scope.worktree reaches complete.
    const matched = await analyzeCode(
      {
        scope: { tenant: "local:f06", clone: "clone:f06", worktree: "wt:evidence-a" },
        language: "typescript",
        path: "src/direct.ts",
        content,
        treeOid: null,
        snapshotId,
        snapshotKind: "working-tree",
        worktreeId: "wt:evidence-a",
        configHash,
        dependencyHash,
        historicalBounds: null,
        verifiedCapture,
      },
      ports,
    );
    expect(matched.state).toBe("complete");
    expect(matched.declarationInventory).toBeDefined();
  });

  // — Review round 2 regressions (REVIEW-lot-E-ASM3-r2.md: F-R2-01 and F-R2-02).

  it("F-R2-01: worktree publication and reconciliation guard committedLeaseHeld without an unconditional microtask yield", async () => {
    const box = createSandbox();
    const { declaration } = buildL0Setup(box);
    const worktreeScope: LiveScope = {
      tenant: declaration.tenant,
      clone: declaration.cloneId,
      worktree: declaration.worktreeId,
    };
    const cloneScope: LiveScope = {
      tenant: declaration.tenant,
      clone: declaration.cloneId,
    };

    const clock = makeFakeScheduleClock(FIXTURE_NOW);
    const watch = new TestWatchPort(clock);
    const authority = new TestWriterAuthority(clock, worktreeScope, declaration.declarationRevision, () => world.incarnationId);
    const world = new TestSchedulingWorld(clock, authority);
    world.sourceFiles.set("src/a.ts", "export const a = 1;\n");
    world.projectedFiles.set("src/a.ts", "export const a = 1;\n");
    world.markers.set("live-checkpoint", "ckpt:r2-01");

    let committedLeaseActive = false;
    let committedAcquiring = false;
    const committedLeaseIds = new Set<string>();
    const overlapEvents: string[] = [];

    const trackedWriter: WriterAuthority = {
      async acquire(req) {
        const tok = await authority.acquire(req);
        if (tok && committedAcquiring) {
          committedLeaseActive = true;
          committedLeaseIds.add(tok.tokenId);
        }
        return tok;
      },
      renew: (tok) => authority.renew(tok),
      validate: (tok) => authority.validate(tok),
      revoke: (tok) => authority.revoke(tok),
      async release(tok) {
        if (committedLeaseIds.has(tok.tokenId)) {
          committedLeaseActive = false;
        }
        await authority.release(tok);
      },
    };

    const sharedBudgets: SchedulerBudgets = {
      maxPendingPaths: 64,
      maxPendingBytes: 16 * 1024 * 1024,
      maxConcurrency: 4,
      maxActiveOperationsPerScope: 1,
      maxRetries: 2,
      retryBaseMs: 50,
      maxBackoffMs: 30_000,
      maxFailedKept: 8,
      maxConsumers: 32,
      maxFileSizeBytes: 1024 * 1024,
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
    };
    const sharedScheduler = new Scheduler(
      {
        clock,
        sink: { deliver: async () => ({ ok: false, retryable: false }) },
        validateToken: (t) => authority.validate(t),
        sleep: world.durability().sleep,
        park: world.durability().park,
        readProgress: world.durability().readProgress,
        writeProgress: world.durability().writeProgress,
        backlogSize: world.durability().backlogSize,
      },
      sharedBudgets,
    );

    let onQuiesceScope: (() => void) | undefined;
    const origQuiesce = sharedScheduler.quiesceScope.bind(sharedScheduler);
    sharedScheduler.quiesceScope = (scopeId: string) => {
      const p = origQuiesce(scopeId);
      const hook = onQuiesceScope;
      if (hook) {
        onQuiesceScope = undefined;
        hook();
      }
      return p;
    };

    world.onDuringPublish = (opts) => {
      if (committedLeaseActive && !committedLeaseIds.has(opts.fencingToken.tokenId)) {
        overlapEvents.push(`worktree-publish-overlapped-committed-lease:${opts.fencingToken.tokenId}`);
      }
    };
    world.onDuringCollect = (opts) => {
      if (committedLeaseActive && !committedLeaseIds.has(opts.fencingToken.tokenId)) {
        overlapEvents.push(`reconcile-collect-overlapped-committed-lease:${opts.fencingToken.tokenId}`);
      }
    };

    let pauseCompletionGate: Promise<void> | undefined;
    let onCompletionEntered: (() => void) | undefined;
    let completionSeq = 0;
    const generationCompletion: GenerationCompletionPort = {
      async complete(message: GenerationCompletionMessageDto): Promise<GenerationCompletionOutcomeDto> {
        completionSeq += 1;
        onCompletionEntered?.();
        if (pauseCompletionGate) {
          await pauseCompletionGate;
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
          storageGenerationId: `sgen:${String(completionSeq).padStart(6, "0")}`,
          storeIncarnation: world.incarnationId,
          pointerVersion: completionSeq,
          publicationReceiptId: `pubrcpt:${String(completionSeq).padStart(6, "0")}`,
          publishedAt: clock.now(),
        };
      },
    };

    const sink = new FakePrivateFencedSink();
    const factory = createLiveFactory({
      declaration,
      ports: {
        ...makeNoopAuxPorts(),
        clock,
        watch,
        scheduling: {
          scheduler: sharedScheduler,
          writer: trackedWriter,
          markerStore: world.markerStore(),
          scan: world.scan(),
          pollRefs: world.pollRefs,
        },
        generationCompletion,
        factSink: sink,
      } as unknown as LiveFactoryPorts,
    });

    const makeCommittedPubReq = (seq: number) => {
      const genId = formatProducerGenerationId(seq);
      const correlation = createGenerationCorrelation({
        producerGenerationId: genId,
        policyVersion: POLICY_VERSION,
        view: "committed",
        scope: cloneScope,
        authorizingDeclaration: {
          declarationId: declaration.declarationId,
          cloneId: declaration.cloneId,
          worktreeId: declaration.worktreeId,
          declarationRevision: declaration.declarationRevision,
        },
        sourceBoundary: {
          view: "committed",
          oidAlgorithm: "sha1",
          observedAt: clock.now(),
          refsFingerprint: sha256Text(`refs:r2-01-${seq}`),
          headCommit: { algorithm: "sha1", oid: "a".repeat(40) },
          rootOids: [{ algorithm: "sha1", oid: "a".repeat(40) }],
          configAttributesFingerprint: sha256Text("cfg:r2-01"),
          completeHistoryFrontier: true,
        },
      });
      const cloneToken: ScopeFencingTokenDto = {
        tokenId: `tok:r2-01-clone-${seq}`,
        scope: cloneScope,
        epoch: 1,
        epochId: `epoch:r2-01-${seq}`,
        declarationRevision: declaration.declarationRevision,
        projectionIncarnation: world.incarnationId,
        issuedAt: clock.now() - 1_000,
        expiresAt: clock.now() + 60_000,
      };
      return {
        generationId: genId,
        fencingToken: cloneToken,
        expectedIncarnation: world.incarnationId,
        requireWatchReady: false,
        completion: {
          correlation,
          receipts: [
            {
              controlVersion: GENERATION_CONTROL_VERSION,
              kind: "batch-receipt" as const,
              received: true as const,
              published: false as const,
              completeBatch: true as const,
              producerGenerationId: genId,
              batchId: `batch:r201:${String(seq).padStart(6, "0")}`,
              batchDigest: "e".repeat(64),
              receiptId: `rcpt:r201-${seq}`,
              byteLength: 256,
              finalBatch: true,
              receivedAt: clock.now(),
            },
          ],
          input: {
            completionState: "complete" as const,
            coverage: [{ axis: "refs" as const, state: "current" as const, reason: "verified", pendingCount: 0, complete: true }],
            exclusions: [],
            errors: [],
            remainingWork: 0,
            completedAt: clock.now(),
          },
        },
      };
    };

    // Part (a): Worktree runPublication arriving in the exact microtask before committed-view
    // resumes from waitForScopeQuiescence must synchronously increment activeWorktreeOps so
    // committed-view waits instead of revoking/overlapping the worktree publication.
    const wtToken = (await authority.acquire({
      scope: worktreeScope,
      minEpoch: 1,
      declarationRevision: declaration.declarationRevision,
      projectionIncarnation: world.incarnationId,
    }))!;
    let wtPubPromise!: Promise<unknown>;
    onQuiesceScope = () => {
      queueMicrotask(() => {
        queueMicrotask(() => {
          wtPubPromise = factory.runCapability("publication", {
            generationId: formatProducerGenerationId(301),
            fencingToken: wtToken,
            expectedIncarnation: world.incarnationId,
            checkpoint: "ckpt:r2-01",
            sourceVector: world.sourceVector(),
            requireWatchReady: false,
          } as never);
        });
      });
    };
    committedAcquiring = true;
    const committedRes1 = await factory.runCapability("publication", makeCommittedPubReq(302) as never);
    committedAcquiring = false;
    const wtPubRes = await wtPubPromise;
    expect(wtPubRes).toMatchObject({ capability: "publication", state: "available", delivered: true, published: true });
    expect(committedRes1).toMatchObject({ capability: "publication", state: "available", delivered: true, published: true });
    expect(overlapEvents).toEqual([]);
    expect(committedLeaseActive).toBe(false);

    // Part (b): runReconciliation arriving after ensureWatchReady in the exact microtask before
    // committed-view resumes from waitForScopeQuiescence must synchronously increment activeWorktreeOps.
    const bootRes = await factory.runCapability("reconciliation", {
      generationId: formatProducerGenerationId(303),
      action: "bootstrap",
    } as never);
    expect(bootRes).toMatchObject({ capability: "reconciliation", state: "available", delivered: true });

    world.sourceFiles.set("src/b.ts", "export const b = 2;\n");
    let recPromise!: Promise<unknown>;
    onQuiesceScope = () => {
      queueMicrotask(() => {
        recPromise = factory.runCapability("reconciliation", {
          generationId: formatProducerGenerationId(304),
          action: "round",
        } as never);
      });
    };
    committedAcquiring = true;
    const committedRes2 = await factory.runCapability("publication", makeCommittedPubReq(305) as never);
    committedAcquiring = false;
    const recRes = await recPromise;
    expect(recRes).toMatchObject({ capability: "reconciliation", state: "available", delivered: true });
    expect(committedRes2).toMatchObject({ capability: "publication", state: "available", delivered: true, published: true });
    expect(overlapEvents).toEqual([]);
    expect(committedLeaseActive).toBe(false);

    // Part (c): While committedLeaseHeld is true, queued reconciliation waits until all
    // committed leases release and re-checks the flag after wakeup with zero overlap.
    let releasePause!: () => void;
    pauseCompletionGate = new Promise<void>((resolve) => {
      releasePause = resolve;
    });
    let enteredResolve!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      enteredResolve = resolve;
    });
    onCompletionEntered = () => {
      onCompletionEntered = undefined;
      enteredResolve();
    };

    world.sourceFiles.set("src/c.ts", "export const c = 3;\n");
    const collectCallsBeforePause = world.collectCalls;
    committedAcquiring = true;
    const committedAPromise = factory.runCapability("publication", makeCommittedPubReq(306) as never);
    await enteredPromise;
    expect(committedLeaseActive).toBe(true);

    const queuedRecPromise = factory.runCapability("reconciliation", {
      generationId: formatProducerGenerationId(307),
      action: "round",
    } as never);
    const committedBPromise = factory.runCapability("publication", makeCommittedPubReq(308) as never);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(world.collectCalls).toBe(collectCallsBeforePause);

    pauseCompletionGate = undefined;
    releasePause();
    const [resA, resB, resQueuedRec] = await Promise.all([committedAPromise, committedBPromise, queuedRecPromise]);
    committedAcquiring = false;
    expect(resA).toMatchObject({ capability: "publication", state: "available", delivered: true, published: true });
    expect(resB).toMatchObject({ capability: "publication", state: "available", delivered: true, published: true });
    expect(resQueuedRec).toMatchObject({ capability: "reconciliation", state: "available", delivered: true });
    expect(overlapEvents).toEqual([]);
    expect(committedLeaseActive).toBe(false);
  });

  it("F-R2-02: publication validates and builds GenerationCompletionMessageDto before lease acquisition or scan publishGeneration", async () => {
    const box = createSandbox();
    const { declaration } = buildL0Setup(box);
    const worktreeScope: LiveScope = {
      tenant: declaration.tenant,
      clone: declaration.cloneId,
      worktree: declaration.worktreeId,
    };
    const cloneScope: LiveScope = {
      tenant: declaration.tenant,
      clone: declaration.cloneId,
    };

    const clock = makeFakeScheduleClock(FIXTURE_NOW);
    const watch = new TestWatchPort(clock);
    const authority = new TestWriterAuthority(clock, worktreeScope, declaration.declarationRevision, () => world.incarnationId);
    const world = new TestSchedulingWorld(clock, authority);
    world.sourceFiles.set("src/a.ts", "export const a = 1;\n");
    world.projectedFiles.set("src/a.ts", "export const a = 1;\n");
    world.markers.set("live-checkpoint", "ckpt:r2-02");

    const sink = new FakePrivateFencedSink();
    const completionCalls: GenerationCompletionMessageDto[] = [];
    const generationCompletion: GenerationCompletionPort = {
      async complete(message: GenerationCompletionMessageDto): Promise<GenerationCompletionOutcomeDto> {
        completionCalls.push(message);
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
          storageGenerationId: `sgen:${String(completionCalls.length).padStart(6, "0")}`,
          storeIncarnation: world.incarnationId,
          pointerVersion: completionCalls.length,
          publicationReceiptId: `pubrcpt:${String(completionCalls.length).padStart(6, "0")}`,
          publishedAt: clock.now(),
        };
      },
    };

    const factory = createLiveFactory({
      declaration,
      ports: {
        ...makeNoopAuxPorts(),
        clock,
        watch,
        scheduling: {
          writer: authority,
          markerStore: world.markerStore(),
          scan: world.scan(),
          pollRefs: world.pollRefs,
          durability: world.durability(),
        },
        generationCompletion,
        factSink: sink,
      } as unknown as LiveFactoryPorts,
    });

    const wtToken = (await authority.acquire({
      scope: worktreeScope,
      minEpoch: 1,
      declarationRevision: declaration.declarationRevision,
      projectionIncarnation: world.incarnationId,
    }))!;
    const acquiredBeforeTests = authority.acquiredTokens.length;

    const makePrivateCorr = (genId: string) =>
      createGenerationCorrelation({
        producerGenerationId: genId,
        policyVersion: CONTENT_POLICY_VERSION,
        view: "private",
        scope: worktreeScope,
        authorizingDeclaration: {
          declarationId: declaration.declarationId,
          cloneId: declaration.cloneId,
          worktreeId: declaration.worktreeId,
          declarationRevision: declaration.declarationRevision,
        },
        sourceBoundary: {
          view: "private",
          oidAlgorithm: "sha1",
          observedAt: clock.now(),
          worktreeId: declaration.worktreeId,
          headCommit: { algorithm: "sha1", oid: "a".repeat(40) },
          captureStable: true,
          snapshotIds: [`lsnap:${"c".repeat(64)}`],
          configAttributesFingerprint: sha256Text("cfg:r2-02-priv"),
          contentFingerprintMode: "none",
        },
      });

    const makeCommittedCorr = (genId: string) =>
      createGenerationCorrelation({
        producerGenerationId: genId,
        policyVersion: POLICY_VERSION,
        view: "committed",
        scope: cloneScope,
        authorizingDeclaration: {
          declarationId: declaration.declarationId,
          cloneId: declaration.cloneId,
          worktreeId: declaration.worktreeId,
          declarationRevision: declaration.declarationRevision,
        },
        sourceBoundary: {
          view: "committed",
          oidAlgorithm: "sha1",
          observedAt: clock.now(),
          refsFingerprint: sha256Text(`refs:r2-02-${genId}`),
          headCommit: { algorithm: "sha1", oid: "a".repeat(40) },
          rootOids: [{ algorithm: "sha1", oid: "a".repeat(40) }],
          configAttributesFingerprint: sha256Text("cfg:r2-02-comm"),
          completeHistoryFrontier: true,
        },
      });

    const makeReceipt = (genId: string, batchId = "batch:r202:000001", digest = "d".repeat(64)): BatchDeliveryReceiptDto => ({
      controlVersion: GENERATION_CONTROL_VERSION,
      kind: "batch-receipt",
      received: true,
      published: false,
      completeBatch: true,
      producerGenerationId: genId,
      batchId,
      batchDigest: digest,
      receiptId: `rcpt:${batchId}`,
      byteLength: 256,
      finalBatch: true,
      receivedAt: clock.now(),
    });

    const validInput = () => ({
      completionState: "complete" as const,
      coverage: [{ axis: "working-tree" as const, state: "current" as const, reason: "verified", pendingCount: 0, complete: true }],
      exclusions: [],
      errors: [],
      remainingWork: 0,
      completedAt: clock.now(),
    });

    // Combined scan + completion mode (private view): malformed completion.input / completion.receipts
    // MUST fail closed BEFORE scheduling.scan.publishGeneration runs.
    const badCombinedPrivateCases: Array<{ readonly label: string; readonly receipts: unknown; readonly input: unknown }> = [
      { label: "null input", receipts: [makeReceipt(formatProducerGenerationId(401))], input: null },
      { label: "invalid completionState", receipts: [makeReceipt(formatProducerGenerationId(402))], input: { ...validInput(), completionState: "invalid-state" } },
      { label: "negative remainingWork", receipts: [makeReceipt(formatProducerGenerationId(403))], input: { ...validInput(), remainingWork: -1 } },
      { label: "disallowed extra key", receipts: [makeReceipt(formatProducerGenerationId(404))], input: { ...validInput(), storageGenerationId: "sgen:forged" } },
      { label: "non-array receipts", receipts: "not-an-array", input: validInput() },
      { label: "receipt for wrong generationId", receipts: [makeReceipt(formatProducerGenerationId(999))], input: validInput() },
      {
        label: "conflicting duplicate batch receipts",
        receipts: [
          makeReceipt(formatProducerGenerationId(407), "batch:r202:dup001", "a".repeat(64)),
          makeReceipt(formatProducerGenerationId(407), "batch:r202:dup001", "b".repeat(64)),
        ],
        input: validInput(),
      },
    ];

    for (let i = 0; i < badCombinedPrivateCases.length; i += 1) {
      const genId = formatProducerGenerationId(401 + i);
      const c = badCombinedPrivateCases[i]!;
      const res = await factory.runCapability("publication", {
        generationId: genId,
        fencingToken: wtToken,
        expectedIncarnation: world.incarnationId,
        checkpoint: "ckpt:r2-02",
        sourceVector: world.sourceVector(),
        completion: {
          correlation: makePrivateCorr(genId),
          receipts: c.receipts,
          input: c.input,
        },
      } as never);
      expect(res, `private combined case "${c.label}"`).toMatchObject({
        capability: "publication",
        state: "unavailable",
        delivered: false,
      });
      expect(world.publishCalls, `zero publishGeneration on "${c.label}"`).toBe(0);
      expect(authority.acquiredTokens.length, `zero extra leases on "${c.label}"`).toBe(acquiredBeforeTests);
      expect(completionCalls).toHaveLength(0);
      expect(sink.deliveries).toHaveLength(0);
    }

    // Combined scan + completion mode (committed view): malformed completion payload MUST fail closed
    // BEFORE acquiring any worktree scheduling lease or calling publishGeneration.
    const genBadCommitted = formatProducerGenerationId(420);
    const cloneToken: ScopeFencingTokenDto = {
      tokenId: "tok:r2-02-clone",
      scope: cloneScope,
      epoch: 1,
      epochId: "epoch:r2-02",
      declarationRevision: declaration.declarationRevision,
      projectionIncarnation: world.incarnationId,
      issuedAt: clock.now() - 1_000,
      expiresAt: clock.now() + 60_000,
    };
    const badCommittedRes = await factory.runCapability("publication", {
      generationId: genBadCommitted,
      fencingToken: cloneToken,
      expectedIncarnation: world.incarnationId,
      checkpoint: "ckpt:r2-02",
      sourceVector: world.sourceVector(),
      completion: {
        correlation: makeCommittedCorr(genBadCommitted),
        receipts: [makeReceipt(genBadCommitted)],
        input: { ...validInput(), expectedBatchCount: 99 },
      },
    } as never);
    expect(badCommittedRes).toMatchObject({ capability: "publication", state: "unavailable", delivered: false });
    expect(world.publishCalls).toBe(0);
    expect(authority.acquiredTokens.length).toBe(acquiredBeforeTests);
    expect(completionCalls).toHaveLength(0);
    expect(sink.deliveries).toHaveLength(0);

    // Positive control: valid combined scan + completion succeeds cleanly.
    const genValid = formatProducerGenerationId(421);
    const validRes = await factory.runCapability("publication", {
      generationId: genValid,
      fencingToken: wtToken,
      expectedIncarnation: world.incarnationId,
      checkpoint: "ckpt:r2-02",
      sourceVector: world.sourceVector(),
      completion: {
        correlation: makePrivateCorr(genValid),
        receipts: [makeReceipt(genValid)],
        input: validInput(),
      },
    } as never);
    expect(validRes).toMatchObject({ capability: "publication", state: "available", delivered: true, published: true });
    expect(world.publishCalls).toBe(1);
    expect(completionCalls).toHaveLength(1);
    expect(sink.deliveries).toHaveLength(1);
  });
});
