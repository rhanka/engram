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
import {
  buildCorpus,
  detectGitCapabilities,
  inventoryDigest,
  LiveGitSandbox,
} from "./helpers/live-git-fixtures.js";
import {
  CONTRACT_VERSION,
  POLICY_VERSION,
  PRODUCER_NAME,
  describeCapabilities,
  validateFactBatch,
  validateRetentionReceipt,
  type FactBatchDto,
  type FactSinkPort,
  type FactSinkReceipt,
  type GithubRepositoryDto,
  type HistoryCheckpointDto,
  type HistoryCommitFactDto,
  type HistoryCompletionQuery,
  type HistoryCompletionState,
  type HistoryPersistencePort,
  type LiveScope,
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
import { formatProducerGenerationId } from "../engram-live/generation.js";
import {
  createLiveFactory,
  deriveDeclarationIdentity,
  type GitPort,
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

function makeNoopAuxPorts(): Pick<LiveFactoryPorts, "filesystem" | "clock" | "content" | "cache" | "grammarRuntime"> {
  return {
    filesystem: {
      async readFileBytes(path: string): Promise<Uint8Array> {
        throw new Error(`unexpected filesystem read: ${path}`);
      },
    },
    clock: { now: () => FIXTURE_NOW },
    content: { liveContentSeam: "host-content" },
    cache: { liveCacheSeam: "host-cache" },
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

    // Single source of capability status: 5 capabilities available (4 from E-ASM2 + code-analysis).
    expect(factory.describeCapabilities()).toEqual(describeCapabilities());
    const availableIds = factory
      .describeCapabilities()
      .filter((entry) => entry.state === "available")
      .map((entry) => entry.capability);
    expect(availableIds).toEqual([
      "refs",
      "history-dag",
      "github-pr",
      "code-analysis",
      "retention-requests",
    ]);

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
      const noSink = createLiveFactory({ declaration, ports: { ...makeBasePorts(new FakeFencedSink()), factSink: undefined } });
      for (const [cap, req] of [
        ["refs", refsReq],
        ["history-dag", historyReq],
        ["github-pr", prReq],
        ["retention-requests", retReq],
      ] as const) {
        const r = await noSink.runCapability(cap, req as never);
        expect(r).toMatchObject({ capability: cap, state: "unavailable", delivered: false });
        expect(r.reason).toMatch(/sink/i);
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
          content: { liveContentSeam: "host-content" },
          cache: { liveCacheSeam: "host-cache" },
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
    const srcNewest = Math.max(
      statSync(join(root, "engram-live", "contracts.ts")).mtimeMs,
      statSync(join(root, "engram-live", "integration.ts")).mtimeMs,
      statSync(join(root, "engram-live", "factory-history.ts")).mtimeMs,
    );
    const needBuild =
      !existsSync(distIntegration) ||
      !existsSync(distFactoryHistory) ||
      statSync(distIntegration).mtimeMs < srcNewest ||
      statSync(distFactoryHistory).mtimeMs < srcNewest;
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
