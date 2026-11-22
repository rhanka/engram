// L9-E — Whole-Worktree Artifact And Temporary Directory Boundary Guards
// (spec/SPEC_LIVE_GIT_INDEXING.md §§2, 11, A07/A13; plan/09-BRANCH_LIVE_GIT_INDEXING.md L9-E).

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import {
  POLICY_VERSION,
  validateFactBatch,
  type FactBatchDto,
  type FactSinkPort,
  type HistoryCheckpointDto,
  type HistoryCommitFactDto,
  type HistoryCompletionQuery,
  type HistoryCompletionState,
  type LocalSnapshotDto,
  type RetainedRootDto,
  type ScopeFencingTokenDto,
} from "../engram-live/contracts.js";
import { decodeFactBatch, encodeFactBatch } from "../engram-live/batch-codec.js";
import { formatProducerGenerationId } from "../engram-live/generation.js";
import {
  DEFAULT_FACTORY_RECONCILE_BUDGETS,
  DEFAULT_FACTORY_SCHEDULER_BUDGETS,
  DEFAULT_FACTORY_WATCH_BUDGETS,
  createLiveDeclaration,
  deriveCloneIdentity,
  deriveDeclarationIdentity,
  deriveWorktreeIdentity,
  type CachePort,
  type ContentProtectionPort,
  type GrammarRuntimePort,
  type HistoryPersistencePort,
  type LatestSnapshotPort,
  type LatestSnapshotQuery,
  type LatestSnapshotScope,
  type MarkerStore,
  type PurgePrivateReceipt,
  type ReconcileScan,
  type ReplaceLatestReceipt,
  type SchedulerDurabilityPort,
  type SourceVector,
  type WriterAuthority,
} from "../engram-live/integration.js";
import { observeRepository } from "../engram-live/repository.js";
import { buildCorpus, inventoryDigest, LiveGitSandbox } from "./helpers/live-git-fixtures.js";
import {
  createVirtualScheduleClock,
  ensureAssembledDistFresh,
  ProducerArtifactTrace,
  type VirtualScheduleClock,
} from "./helpers/live-process-trace.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const liveRoot = join(root, "engram-live");
const repoRequire = createRequire(import.meta.url);

const sandboxes: LiveGitSandbox[] = [];
const traces: ProducerArtifactTrace[] = [];
const virtualClocks: VirtualScheduleClock[] = [];
const activeFactories: Array<{ disable(req?: { reason?: "owner-request" | "policy-withdrawn" | "workspace-remove"; generationId?: string }): Promise<unknown> }> = [];

function createSandbox(): LiveGitSandbox {
  const box = new LiveGitSandbox();
  sandboxes.push(box);
  return box;
}
function trackTrace(trace: ProducerArtifactTrace): ProducerArtifactTrace {
  traces.push(trace);
  return trace;
}

afterEach(async () => {
  for (const factory of activeFactories.splice(0)) {
    await factory.disable({ reason: "policy-withdrawn", generationId: formatProducerGenerationId(999_999) }).catch(() => undefined);
  }
  for (const clock of virtualClocks.splice(0)) {
    clock.clearAll();
  }
  for (const trace of traces.splice(0)) {
    await trace.dispose().catch(() => undefined);
  }
  for (const box of sandboxes.splice(0)) {
    box.dispose();
  }
});

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function createTreeSitterGrammarRuntime(): GrammarRuntimePort {
  const TreeSitter = repoRequire("web-tree-sitter") as {
    Parser: { init(): Promise<void>; new (): { setLanguage(lang: object): void; parse(src: string): unknown; delete(): void } };
    Language: { load(bytes: Uint8Array): Promise<object> };
  };
  let initPromise: Promise<void> | undefined;
  return {
    init() {
      initPromise ??= TreeSitter.Parser.init();
      return initPromise;
    },
    async loadLanguage(wasmBytes: Uint8Array) {
      await (initPromise ??= TreeSitter.Parser.init());
      return TreeSitter.Language.load(new Uint8Array(wasmBytes));
    },
    createParser(languageHandle: object) {
      const parser = new TreeSitter.Parser();
      parser.setLanguage(languageHandle);
      return parser as unknown as ReturnType<GrammarRuntimePort["createParser"]>;
    },
  };
}

function makeFakePorts(options: {
  trace: ProducerArtifactTrace;
  hooksDir: string;
  declaration: ReturnType<typeof createLiveDeclaration>;
  nowRef: { now: number };
}) {
  const delivered: FactBatchDto[] = [];
  const latestStore = new Map<string, LocalSnapshotDto>();
  const cacheEntries = new Map<string, string>();
  const checkpoints = new Map<string, HistoryCheckpointDto>();
  const retainedRoots = new Map<string, RetainedRootDto>();
  const committedHistoryFacts: HistoryCommitFactDto[] = [];
  const markers = new Map<string, string>();
  const issuedTokens = new Map<string, { revoked: boolean }>();
  const publishedGens = new Set<string>();
  const incarnation = "inc:l9e:boundary";
  let seq = 0;

  const factSink: FactSinkPort = {
    async deliver(batch) {
      const checked = validateFactBatch(batch);
      if (!checked.ok) throw new Error(checked.errors.join("; "));
      const encoded = encodeFactBatch(batch);
      const decoded = decodeFactBatch(encoded.bytes);
      delivered.push(decoded);
      return {
        received: true,
        batchId: batch.batchId,
        receiptId: `rcpt:${delivered.length}`,
        retiredSuperseded: true,
        revokedDecryptability: true,
      };
    },
  };

  const protection: ContentProtectionPort = {
    async protect(plaintext) {
      return {
        state: "sealed",
        algorithm: "fake-seal/1",
        keyRef: "key:l9e:boundary",
        ciphertext: Uint8Array.from(plaintext, (b, i) => b ^ ((i + 0x3c) & 0xff)),
      };
    },
  };

  const latestSnapshots: LatestSnapshotPort = {
    async loadLatest(query: LatestSnapshotQuery) {
      return latestStore.get(`${query.scope.tenant}:${query.scope.clone}:${query.worktreeId}:${query.kind}:${query.diffKind}`) ?? null;
    },
    async replaceLatest(snapshot: LocalSnapshotDto, expectedSupersededId: string | null): Promise<ReplaceLatestReceipt> {
      const key = `${snapshot.scope.tenant}:${snapshot.scope.clone}:${snapshot.worktreeId}:${snapshot.kind}:${snapshot.diffKind}`;
      const prev = latestStore.get(key) ?? null;
      if ((prev?.snapshotId ?? null) !== expectedSupersededId) {
        throw new Error("stale predecessor");
      }
      latestStore.set(key, snapshot);
      return { received: true, retiredPrevious: true, revokedDecryptability: true, blockedStaleWork: true };
    },
    async purgePrivate(query: LatestSnapshotScope): Promise<PurgePrivateReceipt> {
      for (const k of [...latestStore.keys()]) {
        if (k.startsWith(`${query.scope.tenant}:${query.scope.clone}:${query.worktreeId}:`)) latestStore.delete(k);
      }
      return { purgedPrivate: true, blockedOldWork: true, revokedDecryptability: true };
    },
  };

  const cache: CachePort = {
    authorize() {},
    async load(key) {
      return cacheEntries.get(key) ?? null;
    },
    async store(key, value) {
      cacheEntries.set(key, value);
    },
  };

  const historyPersistence: HistoryPersistencePort = {
    async loadCompletion(_query: HistoryCompletionQuery): Promise<HistoryCompletionState> {
      return {
        knownComplete: [...checkpoints.values()].map((c) => c.oid),
        checkpoints: [...checkpoints.values()],
        retainedRoots: [...retainedRoots.values()],
      };
    },
    async persistCommitFact(fact: HistoryCommitFactDto) {
      committedHistoryFacts.push(fact);
      return { received: true as const };
    },
    async recordCompletion(checkpoint: HistoryCheckpointDto) {
      checkpoints.set(`${checkpoint.algorithm}:${checkpoint.oid}`, checkpoint);
      return { received: true as const };
    },
    async recordRetainedRoot(rootRec: RetainedRootDto) {
      retainedRoots.set(`${rootRec.algorithm}:${rootRec.oid}`, rootRec);
      return { received: true as const };
    },
  };

  const writer: WriterAuthority = {
    async acquire(req) {
      const token: ScopeFencingTokenDto = {
        tokenId: `tok:sched:${++seq}`,
        scope: { ...req.scope },
        declarationRevision: req.declarationRevision,
        epoch: Math.max(1, req.minEpoch),
        epochId: `epoch:${Math.max(1, req.minEpoch)}`,
        projectionIncarnation: req.projectionIncarnation,
        issuedAt: options.nowRef.now,
        expiresAt: options.nowRef.now + 600_000,
      };
      issuedTokens.set(token.tokenId, { revoked: false });
      return token;
    },
    async renew(token) {
      return issuedTokens.get(token.tokenId)?.revoked ? undefined : { ...token, expiresAt: options.nowRef.now + 600_000 };
    },
    validate(token) {
      const rec = issuedTokens.get(token.tokenId);
      if (!rec) return token.scope.worktree === undefined;
      return !rec.revoked && token.expiresAt > options.nowRef.now;
    },
    revoke(token) {
      const rec = issuedTokens.get(token.tokenId);
      if (rec) rec.revoked = true;
    },
    async release(token) {
      const rec = issuedTokens.get(token.tokenId);
      if (rec) rec.revoked = true;
    },
  };

  const sourceVector: SourceVector = {
    refsFingerprint: sha256Hex("refs:boundary"),
    headOid: "a".repeat(40),
    indexFingerprint: sha256Hex("index:boundary"),
    pathMembershipFingerprint: sha256Hex("paths:boundary"),
    contentFingerprint: sha256Hex("content:boundary"),
    configAttributesFingerprint: sha256Hex("cfg:boundary"),
    lockStateValid: true,
  };

  const markerStore: MarkerStore = {
    get: (key) => markers.get(key),
    set: (key, value) => { markers.set(key, value); },
    delete: (key) => { markers.delete(key); },
    incarnation: () => incarnation,
    hasGeneration: (inc, genId) => inc === incarnation && publishedGens.has(genId),
  };

  const scan: ReconcileScan = {
    async discoverPage() {
      return {
        entries: [{ path: "app.ts", statSize: 42, contentFingerprint: sha256Hex("app.ts") }],
        deletedPaths: [],
        nextCursor: undefined,
        done: true,
        complete: true,
      };
    },
    async collectPaths(paths) {
      return { collected: [...paths], receiptId: "collect:boundary", complete: true };
    },
    async repairRelations() {
      return { receiptId: "repair:boundary", complete: true };
    },
    async validateSource(expected) {
      return {
        valid: true,
        projectionMatches: true,
        sourceVector: expected,
        validatedAt: options.nowRef.now,
        axes: {
          refs: { complete: true },
          dag: { complete: true },
          "pr-metadata": { complete: true },
          "object-availability": { complete: true },
          "pr-attribution": { complete: true },
          ast: { complete: true },
          index: { complete: true },
          "working-tree": { complete: true },
          "remote-publication": { complete: true },
          "line-attribution": { complete: true },
          "symbol-correspondence": { complete: true },
        },
      };
    },
    async publishGeneration(req) {
      publishedGens.add(req.generationId);
      return { published: true, generationId: req.generationId, incarnation, receiptId: `pub:${req.generationId}` };
    },
    currentSourceVector: () => sourceVector,
    pathFingerprint: (p) => sha256Hex(p),
  };

  const durability: SchedulerDurabilityPort = {
    async sleep() {},
    park() {},
    readProgress() {
      return undefined;
    },
    writeProgress() {},
    backlogSize() {
      return 0;
    },
  };

  const virtualClock = createVirtualScheduleClock(options.nowRef.now);
  virtualClocks.push(virtualClock);

  return {
    delivered,
    latestStore,
    incarnation,
    virtualClock,
    ports: {
      git: options.trace.wrapGitPort({ disabledHooksDir: options.hooksDir }),
      filesystem: { async readFileBytes(p: string) { return new Uint8Array(readFileSync(p)); } },
      clock: {
        now: () => options.nowRef.now,
        schedule: (ms: number, cb: () => void) => {
          virtualClock.setNow(options.nowRef.now);
          return virtualClock.schedule(ms, cb);
        },
      },
      content: { protection, latestSnapshots },
      factSink,
      cache,
      grammarRuntime: createTreeSitterGrammarRuntime(),
      historyPersistence,
      watch: {
        async start() {},
        async stop() {},
        onSignal() {
          return () => {};
        },
      },
      scheduling: {
        writer,
        markerStore,
        scan,
        pollRefs: async () => [{ ref: "refs/heads/main", oid: "a".repeat(40) }],
        durability,
        schedulerBudgets: DEFAULT_FACTORY_SCHEDULER_BUDGETS,
        watchBudgets: DEFAULT_FACTORY_WATCH_BUDGETS,
        reconcileBudgets: DEFAULT_FACTORY_RECONCILE_BUDGETS,
      },
    },
  };
}

describe("L9-E whole-worktree and temporary directory artifact boundaries", () => {
  beforeAll(() => ensureAssembledDistFresh(root));

  it("complete producer cycles preserve tracked untracked ignored files status gitattributes and Git config", async () => {
    const box = createSandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const hooksDir = join(box.root, "disabled-hooks");
    const hostStateDir = join(box.root, "host-state");
    mkdirSync(hooksDir, { recursive: true });
    mkdirSync(hostStateDir, { recursive: true });

    // Enrich corpus with user index.lock and independent .engram/ corpus state.
    writeFileSync(join(corpus.repo, ".git", "index.lock"), "host user lock\n", "utf8");
    mkdirSync(join(corpus.repo, ".engram"), { recursive: true });
    writeFileSync(join(corpus.repo, ".engram", "graph.json"), '{"annotations":"preserved"}\n', "utf8");

    // Create a clean multi-state worktree free of tripwire filter drivers to also
    // verify `git status --porcelain=v2` across tracked, untracked, ignored,
    // .gitattributes and local Git config before and after every lifecycle phase.
    const cleanRepo = box.init(join(box.root, "clean-local"));
    writeFileSync(join(cleanRepo, "app.ts"), "export const clean = (x: number) => x + 1;\n", "utf8");
    writeFileSync(join(cleanRepo, "untracked-local.ts"), "export const untrackedLocal = 42;\n", "utf8");
    writeFileSync(join(cleanRepo, ".gitignore"), "*.ignored.tmp\nignored-dir/\n", "utf8");
    writeFileSync(join(cleanRepo, "scratch.ignored.tmp"), "ignored local payload\n", "utf8");
    mkdirSync(join(cleanRepo, "ignored-dir"), { recursive: true });
    writeFileSync(join(cleanRepo, "ignored-dir", "notes.txt"), "ignored nested bytes\n", "utf8");
    writeFileSync(join(cleanRepo, ".gitattributes"), "untracked-local.ts -filter -diff\n", "utf8");
    box.git(cleanRepo, ["add", "app.ts", ".gitignore", ".gitattributes"]);
    box.git(cleanRepo, ["commit", "-q", "-m", "clean base"]);
    box.git(cleanRepo, ["config", "user.name", "Boundary Tester"]);
    writeFileSync(join(cleanRepo, "app.ts"), "export const clean = (x: number) => x + 2;\n", "utf8");

    const snapshotWorktreeControls = () => ({
      digest: inventoryDigest(corpus),
      cleanDigest: inventoryDigest({ root: cleanRepo }),
      corpusLsStage: box.read(corpus.repo, ["ls-files", "--stage", "-z"]).toString("hex"),
      corpusOthers: box.read(corpus.repo, ["ls-files", "--others", "-z"]).toString("hex"),
      cleanStatus: box.read(cleanRepo, ["status", "--porcelain=v2", "-z", "-uall"]).toString("hex"),
      cleanIgnored: box.read(cleanRepo, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]).toString("hex"),
      gitattributes: readFileSync(join(corpus.repo, ".gitattributes"), "hex"),
      cleanGitattributes: readFileSync(join(cleanRepo, ".gitattributes"), "hex"),
      gitignore: readFileSync(join(cleanRepo, ".gitignore"), "hex"),
      configMain: readFileSync(join(corpus.repo, ".git", "config"), "hex"),
      configClean: readFileSync(join(cleanRepo, ".git", "config"), "hex"),
      configList: box.read(cleanRepo, ["config", "--local", "--list", "--null"]).toString("hex"),
      refs: box.read(corpus.repo, ["for-each-ref"]).toString("hex"),
      untracked: readFileSync(join(cleanRepo, "untracked-local.ts"), "hex"),
      ignoredFile: readFileSync(join(cleanRepo, "scratch.ignored.tmp"), "hex"),
      ignoredDirFile: readFileSync(join(cleanRepo, "ignored-dir", "notes.txt"), "hex"),
      indexLock: readFileSync(join(corpus.repo, ".git", "index.lock"), "hex"),
      engramGraph: readFileSync(join(corpus.repo, ".engram", "graph.json"), "hex"),
    });

    const baseline = snapshotWorktreeControls();
    const commonDirRealpath = realpathSync(join(corpus.repo, ".git"));
    const mainGitDir = box.git(corpus.repo, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
    const clone = deriveCloneIdentity({
      hostScope: "host:l9e:boundary",
      commonDirRealpath,
      commonDirProjectFingerprint: "fp:l9e:boundary",
      oidAlgorithm: "sha1",
    });
    const worktree = deriveWorktreeIdentity({
      hostScope: "host:l9e:boundary",
      clone,
      worktreePath: corpus.repo,
      gitDir: mainGitDir,
      worktreeFingerprint: "fp:l9e:boundary:wt",
    });
    const ids = deriveDeclarationIdentity({ hostScope: "host:l9e:boundary", clone, worktree });
    const declaration = createLiveDeclaration({
      tenant: "local:l9e-owner",
      principal: "local:l9e-principal",
      hostFingerprint: "l9e-boundary-fp",
      identityUncertainty: [],
      declarationId: ids.declarationId,
      cloneId: clone.cloneId,
      worktreeId: worktree.worktreeId,
      authorizedRoots: [corpus.repo, corpus.linked],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
    });

    const nowRef = { now: 1_700_000_000_000 + 5 * 86_400_000 };
    const trace = trackTrace(new ProducerArtifactTrace({
      trace: box.trace,
      allowedHostDirs: [hooksDir, hostStateDir],
      observedRoots: [corpus.root],
      mustStayEmptyDirs: [hooksDir],
    }));
    const fake = makeFakePorts({ trace, hooksDir, declaration, nowRef });
    const distIntegration = (await import(
      pathToFileURL(join(liveRoot, "dist", "integration.js")).href
    )) as typeof import("../engram-live/integration.js");
    const factory = distIntegration.createLiveFactory({ declaration, ports: fake.ports });
    activeFactories.push(factory);

    const cloneToken: ScopeFencingTokenDto = {
      tokenId: "tok:clone:art:1",
      scope: { tenant: declaration.tenant, clone: declaration.cloneId },
      declarationRevision: declaration.declarationRevision,
      epoch: 1,
      epochId: "epoch:1",
      projectionIncarnation: fake.incarnation,
      issuedAt: nowRef.now - 1_000,
      expiresAt: nowRef.now + 600_000,
    };
    const worktreeToken: ScopeFencingTokenDto = {
      ...cloneToken,
      tokenId: "tok:wt:art:1",
      scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
    };

    const assertStagePreserved = (stage: string) => {
      expect(snapshotWorktreeControls(), `LIVE §2 inventory/status/digest must remain identical after ${stage}`).toEqual(baseline);
      expect(existsSync(corpus.tripwireMarker), `tripwire executed at ${stage}`).toBe(false);
    };

    // Phase 1: Activation
    assertStagePreserved("activation");

    // Phase 2: Scan (refs, history-dag, index-snapshot, working-tree, diffs, local code-analysis)
    const refsRes = await factory.runCapability("refs", {
      cwd: corpus.repo,
      defaultBranch: "refs/heads/main",
      generationId: formatProducerGenerationId(1),
      fencingToken: cloneToken,
    });
    expect(refsRes).toMatchObject({ capability: "refs", state: "available", delivered: true });
    assertStagePreserved("scan:refs");

    const repository = observeRepository({
      hostScope: "host:l9e:boundary",
      commonDirRealpath,
      commonDirProjectFingerprint: "fp:l9e:boundary",
      oidAlgorithm: "sha1",
      worktrees: [
        {
          worktreePath: corpus.repo,
          gitDir: mainGitDir,
          worktreeFingerprint: "fp:l9e:boundary:wt",
          head: { kind: "branch", refName: "refs/heads/main" },
        },
      ],
    });
    const histRes = await factory.runCapability("history-dag", {
      cwd: corpus.repo,
      repository,
      defaultBranch: "refs/heads/main",
      generationId: formatProducerGenerationId(2),
      fencingToken: cloneToken,
    });
    expect(histRes, JSON.stringify(histRes)).toMatchObject({ capability: "history-dag", state: "available", delivered: true });
    assertStagePreserved("scan:history-dag");

    const cleanDecl = createLiveDeclaration({
      tenant: declaration.tenant,
      principal: declaration.principal,
      hostFingerprint: declaration.hostFingerprint,
      identityUncertainty: [],
      declarationId: "decl:l9e:clean",
      cloneId: "clone:l9e:clean",
      worktreeId: "wt:l9e:clean",
      authorizedRoots: [cleanRepo],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
    });
    const cleanTrace = trackTrace(new ProducerArtifactTrace({
      trace: box.trace,
      allowedHostDirs: [hooksDir, hostStateDir],
      observedRoots: [cleanRepo],
      mustStayEmptyDirs: [hooksDir],
    }));
    const cleanFake = makeFakePorts({ trace: cleanTrace, hooksDir, declaration: cleanDecl, nowRef });
    const cleanFactory = distIntegration.createLiveFactory({ declaration: cleanDecl, ports: cleanFake.ports });
    activeFactories.push(cleanFactory);
    const cleanWtToken: ScopeFencingTokenDto = {
      ...worktreeToken,
      tokenId: "tok:clean:wt:1",
      scope: { tenant: cleanDecl.tenant, clone: cleanDecl.cloneId, worktree: cleanDecl.worktreeId },
      projectionIncarnation: cleanFake.incarnation,
    };

    const idxRes = await cleanFactory.runCapability("index-snapshot", {
      cwd: cleanRepo,
      generationId: formatProducerGenerationId(3),
      fencingToken: cleanWtToken,
    });
    expect(idxRes, JSON.stringify(idxRes)).toMatchObject({ capability: "index-snapshot", state: "available", delivered: true });
    assertStagePreserved("scan:index-snapshot");

    const wtRes = await cleanFactory.runCapability("working-tree", {
      cwd: cleanRepo,
      generationId: formatProducerGenerationId(4),
      fencingToken: cleanWtToken,
    });
    expect(wtRes, JSON.stringify(wtRes)).toMatchObject({ capability: "working-tree", state: "available", delivered: true });
    assertStagePreserved("scan:working-tree");

    const diffRes = await cleanFactory.runCapability("diffs", {
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [
        { path: Buffer.from("app.ts", "utf8"), mode: "100644", oid: "b".repeat(40), stage: 0, kind: "file", size: 42, isBinary: false },
      ],
      tipEntries: [
        { path: Buffer.from("app.ts", "utf8"), mode: "100644", oid: "c".repeat(40), stage: 0, kind: "file", size: 42, isBinary: false },
      ],
      generationId: formatProducerGenerationId(9),
      fencingToken: cleanWtToken,
    });
    expect(diffRes, JSON.stringify(diffRes)).toMatchObject({ capability: "diffs", state: "available", delivered: true });
    assertStagePreserved("scan:diffs");

    // Phase 3: Reconciliation & Publication
    const convRes = await factory.runCapability("reconciliation", {
      generationId: formatProducerGenerationId(5),
      action: "converge",
    });
    expect(convRes, JSON.stringify(convRes)).toMatchObject({ capability: "reconciliation", state: "available", converged: true });
    assertStagePreserved("reconciliation");

    const cleanConvRes = await cleanFactory.runCapability("reconciliation", {
      generationId: formatProducerGenerationId(10),
      action: "converge",
    });
    expect(cleanConvRes, JSON.stringify(cleanConvRes)).toMatchObject({ capability: "reconciliation", state: "available", converged: true });
    const pubToken = await cleanFake.ports.scheduling.writer.acquire({
      scope: { tenant: cleanDecl.tenant, clone: cleanDecl.cloneId, worktree: cleanDecl.worktreeId },
      declarationRevision: cleanDecl.declarationRevision,
      minEpoch: 1,
      projectionIncarnation: cleanFake.incarnation,
    });
    const pubRes = await cleanFactory.runCapability("publication", {
      generationId: formatProducerGenerationId(11),
      fencingToken: pubToken,
      expectedIncarnation: cleanFake.incarnation,
      checkpoint: "ckpt:l9e:boundary:1",
    });
    expect(pubRes, JSON.stringify(pubRes)).toMatchObject({ capability: "publication", state: "available", delivered: true });
    assertStagePreserved("publication");

    // Phase 4: Reads & Restart
    expect(factory.describeCapabilities()).toHaveLength(10);
    expect(await factory.loadGrammar("typescript")).toMatchObject({ state: "available" });
    const restartRes = await factory.runCapability("reconciliation", {
      generationId: formatProducerGenerationId(6),
      action: "restart",
    });
    expect(restartRes, JSON.stringify(restartRes)).toMatchObject({ capability: "reconciliation", state: "available" });
    assertStagePreserved("reads+restart");

    // Phase 5: Disable + unregister purge
    const disRes = await factory.disable({
      reason: "workspace-remove",
      generationId: formatProducerGenerationId(7),
    });
    expect(disRes.disabled).toBe(true);
    const cleanDisRes = await cleanFactory.disable({
      reason: "workspace-remove",
      generationId: formatProducerGenerationId(8),
    });
    expect(cleanDisRes.disabled).toBe(true);

    expect(fake.virtualClock.pendingCount()).toBe(0);
    expect(cleanFake.virtualClock.pendingCount()).toBe(0);
    assertStagePreserved("disable");
    trace.assertSafe();
    cleanTrace.assertSafe();
  }, 25_000);

  it("a complete producer cycle through the assembled factory leaves no file under the OS temporary directory and none outside the injected host locations", async () => {
    const box = createSandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const hooksDir = join(box.root, "disabled-hooks");
    const hostStateDir = join(box.root, "host-state");
    const hostHomeDir = join(box.root, "host-home");
    const hostXdgDir = join(box.root, "host-xdg");
    const isolatedTmp = join(box.root, "isolated-os-tmp");
    for (const dir of [hooksDir, hostStateDir, hostHomeDir, hostXdgDir, isolatedTmp]) {
      mkdirSync(dir, { recursive: true });
    }

    const cleanRepo = box.init(join(box.root, "clean-boundary-repo"));
    const localWorkingCode = "export function add(a: number, b: number): number { return a + b; }\n";
    writeFileSync(join(cleanRepo, "app.ts"), localWorkingCode, "utf8");
    box.git(cleanRepo, ["add", "app.ts"]);
    box.git(cleanRepo, ["commit", "-q", "-m", "initial clean commit"]);
    const updatedWorkingCode = "export function add(a: number, b: number): number { return a + b + 1; }\n";
    writeFileSync(join(cleanRepo, "app.ts"), updatedWorkingCode, "utf8");

    const digestCorpusBefore = inventoryDigest(corpus);
    const digestCleanBefore = inventoryDigest({ root: cleanRepo });
    const commonDir = realpathSync(join(corpus.repo, ".git"));
    const mainGitDir = box.git(corpus.repo, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
    const cleanGitDir = box.git(cleanRepo, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();

    const probeResult = await ProducerArtifactTrace.runIsolatedProducerProbe({
      trace: box.trace,
      isolatedTmpDir: isolatedTmp,
      allowedHostDirs: [hostStateDir],
      writableHostDirs: [hostStateDir],
      mustStayEmptyDirs: [hooksDir, hostHomeDir, hostXdgDir],
      observedRoots: [corpus.root, cleanRepo],
      hostHomeDir,
      hostXdgDir,
      entryModuleUrl: pathToFileURL(join(liveRoot, "dist", "integration.js")).href,
      contractsModuleUrl: pathToFileURL(join(liveRoot, "dist", "contracts.js")).href,
      batchCodecModuleUrl: pathToFileURL(join(liveRoot, "dist", "batch-codec.js")).href,
      generationModuleUrl: pathToFileURL(join(liveRoot, "dist", "generation.js")).href,
      repoRoot: root,
      payload: {
        corpusRepo: corpus.repo,
        corpusCommonDir: commonDir,
        corpusGitDir: mainGitDir,
        cleanRepo,
        cleanGitDir,
        updatedWorkingCode,
        hooksDir,
        hostStateDir,
        gitPath: box.trace.executable,
        now: 1_700_000_000_000 + 5 * 86_400_000,
      },
      scriptBody: `
        import assert from "node:assert/strict";
        import { createHash } from "node:crypto";
        import { readFileSync, writeFileSync } from "node:fs";
        import { tmpdir } from "node:os";
        import { join } from "node:path";
        import { createRequire } from "node:module";

        const TreeSitter = createRequire(${JSON.stringify(join(root, "package.json"))})("web-tree-sitter");
        const integration = await import(DATA.entryModuleUrl);
        const contracts = await import(DATA.contractsModuleUrl);
        const codec = await import(DATA.batchCodecModuleUrl);
        const generation = await import(DATA.generationModuleUrl);
        const sha256 = (x) => createHash("sha256").update(x).digest("hex");

        assert.equal(tmpdir(), DATA.isolatedTmpDir, "child probe TMPDIR must target isolated dir");

        const clone = integration.deriveCloneIdentity({
          hostScope: "host:probe",
          commonDirRealpath: DATA.payload.cleanGitDir,
          commonDirProjectFingerprint: "fp:probe",
          oidAlgorithm: "sha1",
        });
        const wt = integration.deriveWorktreeIdentity({
          hostScope: "host:probe",
          clone,
          worktreePath: DATA.payload.cleanRepo,
          gitDir: DATA.payload.cleanGitDir,
          worktreeFingerprint: "fp:probe:wt",
        });
        const declIds = integration.deriveDeclarationIdentity({ hostScope: "host:probe", clone, worktree: wt });
        const declaration = integration.createLiveDeclaration({
          tenant: "local:probe-owner",
          principal: "local:probe-principal",
          hostFingerprint: "probe-fp",
          identityUncertainty: [],
          declarationId: declIds.declarationId,
          cloneId: clone.cloneId,
          worktreeId: wt.worktreeId,
          authorizedRoots: [DATA.payload.cleanRepo, DATA.payload.corpusRepo],
          liveCapability: "live",
          policyVersion: contracts.POLICY_VERSION,
        });

        // 1. Missing disabledHooksDir must refuse BEFORE creating any tmpdir fallback.
        const badFactory = integration.createLiveFactory({
          declaration,
          ports: {
            git: { gitPath: DATA.payload.gitPath },
            filesystem: { async readFileBytes(p) { return new Uint8Array(readFileSync(p)); } },
            clock: { now: () => DATA.payload.now },
            factSink: { async deliver(b) { return { received: true, batchId: b.batchId }; } },
            grammarRuntime: { init() {}, async loadLanguage() { throw new Error("unused"); }, createParser() { throw new Error("unused"); } },
          },
        });
        const refused = await badFactory.runCapability("working-tree", {
          cwd: DATA.payload.cleanRepo,
          generationId: generation.formatProducerGenerationId(1),
          fencingToken: {
            tokenId: "tok:bad:1",
            scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
            declarationRevision: declaration.declarationRevision,
            epoch: 1,
            epochId: "epoch:1",
            projectionIncarnation: "inc:probe",
            issuedAt: DATA.payload.now - 1000,
            expiresAt: DATA.payload.now + 600000,
          },
        });
        assert.equal(refused.state, "unavailable");

        // 2. Full cycle through assembled factory writes durable host state ONLY inside injected hostStateDir.
        const deliveries = [];
        const snapshots = new Map();
        const historyCommits = [];
        const markers = new Map();
        let schedToken;
        const inc = "inc:probe:1";
        let seq = 0;

        const __timers = new Set();
        const makeFactory = () => integration.createLiveFactory({
          declaration,
          ports: {
            git: DATA.tracedGitPort({ disabledHooksDir: DATA.payload.hooksDir }),
            filesystem: { async readFileBytes(p) { return new Uint8Array(readFileSync(p)); } },
            clock: {
              now: () => DATA.payload.now,
              schedule: (ms, cb) => {
                const entry = { at: DATA.payload.now + (Number.isFinite(ms) && ms > 0 ? ms : 0), cb };
                __timers.add(entry);
                return () => { __timers.delete(entry); };
              },
            },
            content: {
              protection: {
                async protect(pt) {
                  return { state: "sealed", algorithm: "fake-seal/1", keyRef: "key:probe:1", ciphertext: new Uint8Array(pt) };
                },
              },
              latestSnapshots: {
                async loadLatest(q) { return snapshots.get(q.kind + ":" + q.diffKind) ?? null; },
                async replaceLatest(s, prev) {
                  const k = s.kind + ":" + s.diffKind;
                  assert.equal(snapshots.get(k)?.snapshotId ?? null, prev);
                  snapshots.set(k, s);
                  const p = join(DATA.payload.hostStateDir, "latest-snapshot.json");
                  writeFileSync(p, JSON.stringify({ snapshotId: s.snapshotId }));
                  DATA.recordWrite(p);
                  return { received: true, retiredPrevious: true, revokedDecryptability: true, blockedStaleWork: true };
                },
                async purgePrivate() {
                  snapshots.clear();
                  const p = join(DATA.payload.hostStateDir, "purged.marker");
                  writeFileSync(p, "purged");
                  DATA.recordWrite(p);
                  return { purgedPrivate: true, blockedOldWork: true, revokedDecryptability: true };
                },
              },
            },
            factSink: {
              async deliver(batch) {
                const encoded = codec.encodeFactBatch(batch);
                deliveries.push(encoded.bytes.byteLength);
                const p = join(DATA.payload.hostStateDir, "sink-count.txt");
                writeFileSync(p, String(deliveries.length));
                DATA.recordWrite(p);
                return { received: true, batchId: batch.batchId, retiredSuperseded: true, revokedDecryptability: true };
              },
            },
            cache: {
              authorize() {},
              async load() { return null; },
              async store(k, v) {
                const p = join(DATA.payload.hostStateDir, "cache-" + sha256(k).slice(0, 12));
                writeFileSync(p, v);
                DATA.recordWrite(p);
              },
            },
            grammarRuntime: {
              init() { return TreeSitter.Parser.init(); },
              async loadLanguage(b) { await TreeSitter.Parser.init(); return TreeSitter.Language.load(new Uint8Array(b)); },
              createParser(h) { const p = new TreeSitter.Parser(); p.setLanguage(h); return p; },
            },
            historyPersistence: {
              async loadCompletion() { return { knownComplete: [], checkpoints: [], retainedRoots: [] }; },
              async persistCommitFact(f) { historyCommits.push(f.oid); return { received: true }; },
              async recordCompletion() { return { received: true }; },
              async recordRetainedRoot() { return { received: true }; },
            },
            watch: {
              async start() {},
              async stop() {},
              onSignal() { return () => {}; },
            },
            scheduling: {
              writer: {
                async acquire(r) {
                  schedToken = {
                    tokenId: "tok:sched:" + (++seq),
                    scope: { ...r.scope },
                    declarationRevision: r.declarationRevision,
                    epoch: Math.max(1, r.minEpoch),
                    epochId: "epoch:" + Math.max(1, r.minEpoch),
                    projectionIncarnation: r.projectionIncarnation,
                    issuedAt: DATA.payload.now,
                    expiresAt: DATA.payload.now + 600000,
                  };
                  return schedToken;
                },
                async renew(t) { return t; },
                validate() { return true; },
                revoke() {},
                async release() {},
              },
              markerStore: {
                get: (k) => markers.get(k),
                set: (k, v) => { markers.set(k, v); },
                delete: (k) => { markers.delete(k); },
                incarnation: () => inc,
                hasGeneration: (i, g) => i === inc && g.length > 0,
              },
              scan: {
                async discoverPage() { return { entries: [{ path: "app.ts", statSize: 42, contentFingerprint: sha256("app.ts") }], deletedPaths: [], nextCursor: undefined, done: true, complete: true }; },
                async collectPaths(paths) { return { collected: [...paths], receiptId: "collect:1", complete: true }; },
                async repairRelations() { return { receiptId: "repair:1", complete: true }; },
                async validateSource(expected) {
                  return {
                    valid: true,
                    projectionMatches: true,
                    sourceVector: expected,
                    validatedAt: DATA.payload.now,
                    axes: {
                      refs: { complete: true },
                      dag: { complete: true },
                      "pr-metadata": { complete: true },
                      "object-availability": { complete: true },
                      "pr-attribution": { complete: true },
                      ast: { complete: true },
                      index: { complete: true },
                      "working-tree": { complete: true },
                      "remote-publication": { complete: true },
                      "line-attribution": { complete: true },
                      "symbol-correspondence": { complete: true },
                    },
                  };
                },
                async publishGeneration(req) { return { published: true, generationId: req.generationId, incarnation: inc, receiptId: "pub:1" }; },
                currentSourceVector: () => ({
                  refsFingerprint: sha256("r"),
                  headOid: "a".repeat(40),
                  indexFingerprint: sha256("i"),
                  pathMembershipFingerprint: sha256("p"),
                  contentFingerprint: sha256("c"),
                  configAttributesFingerprint: sha256("cfg"),
                  lockStateValid: true,
                }),
                pathFingerprint: (p) => sha256(p),
              },
              pollRefs: async () => [{ ref: "refs/heads/main", oid: "a".repeat(40) }],
              durability: {
                async sleep() {},
                park() {},
                readProgress() { return undefined; },
                writeProgress() {},
                backlogSize() { return 0; },
              },
            },
          },
        });

        const cloneToken = {
          tokenId: "tok:clone:probe",
          scope: { tenant: declaration.tenant, clone: declaration.cloneId },
          declarationRevision: declaration.declarationRevision,
          epoch: 1,
          epochId: "epoch:1",
          projectionIncarnation: inc,
          issuedAt: DATA.payload.now - 1000,
          expiresAt: DATA.payload.now + 600000,
        };
        const wtToken = {
          ...cloneToken,
          tokenId: "tok:wt:probe",
          scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
        };

        const factory1 = makeFactory();
        try {
          assert.equal((await factory1.runCapability("refs", { cwd: DATA.payload.cleanRepo, defaultBranch: "refs/heads/main", generationId: generation.formatProducerGenerationId(2), fencingToken: cloneToken })).state, "available");
          const histRes = await factory1.runCapability("history-dag", {
            cwd: DATA.payload.cleanRepo,
            repository: {
              clone,
              worktrees: [{ identity: wt, head: { kind: "branch", refName: "refs/heads/main" } }],
              shallowBoundary: [],
            },
            defaultBranch: "refs/heads/main",
            generationId: generation.formatProducerGenerationId(3),
            fencingToken: cloneToken,
          });
          assert.equal(histRes.state, "available", JSON.stringify(histRes));
          const wtRes = await factory1.runCapability("working-tree", {
            cwd: DATA.payload.cleanRepo,
            generationId: generation.formatProducerGenerationId(4),
            fencingToken: wtToken,
          });
          assert.equal(wtRes.state, "available", JSON.stringify(wtRes));
          const codeRes = await factory1.runCapability("code-analysis", {
            input: {
              scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
              language: "typescript",
              path: "app.ts",
              content: DATA.payload.updatedWorkingCode,
              treeOid: null,
              snapshotId: wtRes.snapshot.snapshotId,
              snapshotKind: "working-tree",
              worktreeId: declaration.worktreeId,
              configHash: sha256("cfg:v1"),
              dependencyHash: sha256("deps:v1"),
              historicalBounds: null,
            },
            objects: { async loadBlob() { return null; }, async loadObject() { return null; } },
            capture: { cwd: DATA.payload.cleanRepo, snapshotKind: "working-tree" },
          });
          assert.equal(codeRes.analysis.state, "complete");
          const convRes = await factory1.runCapability("reconciliation", { generationId: generation.formatProducerGenerationId(5), action: "converge" });
          assert.equal(convRes.converged, true, JSON.stringify(convRes));
          const restartRes = await factory1.runCapability("reconciliation", { generationId: generation.formatProducerGenerationId(6), action: "restart" });
          assert.equal(restartRes.state, "available", JSON.stringify(restartRes));
        } finally {
          const dis1 = await factory1.disable({ reason: "owner-request", generationId: generation.formatProducerGenerationId(7) });
          assert.equal(dis1.disabled, true);
          assert.equal(__timers.size, 0, "virtual timers must be cleared on factory1.disable()");
        }

        // Recreated factory simulates process restart + reads + disable.
        const factory2 = makeFactory();
        try {
          assert.equal(factory2.describeCapabilities().length, 10);
          assert.equal((await factory2.loadGrammar("typescript")).state, "available");
        } finally {
          const dis2 = await factory2.disable({ reason: "policy-withdrawn", generationId: generation.formatProducerGenerationId(8) });
          assert.equal(dis2.disabled, true);
          assert.equal(__timers.size, 0, "virtual timers must be cleared on factory2.disable()");
        }
        assert.ok(deliveries.length >= 4);

        // Verify __tracedGitPort().spawn handles non-UTF-8 pathBytes cleanly inside the isolated probe (F-09).
        const tracedGit = DATA.tracedGitPort({ disabledHooksDir: DATA.payload.hooksDir });
        const rawBytesCheck = tracedGit.spawn(DATA.payload.gitPath, ["ls-files", "--error-unmatch", "--"], {
          cwd: DATA.payload.cleanRepo,
          pathBytes: new Uint8Array([0x72, 0x61, 0x77, 0xff, 0x2e, 0x74, 0x78, 0x74]),
        });
        assert.equal(rawBytesCheck.status, 1);
      `,
    });

    probeResult.assertBoundaryClean();
    expect(inventoryDigest(corpus)).toBe(digestCorpusBefore);
    expect(inventoryDigest({ root: cleanRepo })).toBe(digestCleanBefore);

    // Discriminating negative check: an uncleaned temp file in isolatedTmp MUST be caught!
    const strayTmpFile = join(isolatedTmp, "leaked-engram-artifact.tmp");
    writeFileSync(strayTmpFile, "stray", "utf8");
    expect(() => probeResult.assertBoundaryClean()).toThrow(/temporary directory|boundary/i);
    rmSync(strayTmpFile, { force: true });

    // Negative check: any file appearing in hostHomeDir, hostXdgDir, or hooksDir MUST be caught!
    for (const emptyDir of [hostHomeDir, hostXdgDir, hooksDir]) {
      const strayHostFile = join(emptyDir, "unexpected-host-leak.txt");
      writeFileSync(strayHostFile, "leak", "utf8");
      expect(() => probeResult.assertBoundaryClean()).toThrow(/must remain empty/i);
      rmSync(strayHostFile, { force: true });
    }

    // And an unallowed write outside host locations recorded by the trace MUST be caught!
    const leakedOutside = mkdtempSync(join(box.root, "outside-leak-"));
    probeResult.recordFileWrite(join(leakedOutside, "escape.json"));
    expect(() => probeResult.assertBoundaryClean()).toThrow(/outside injected host locations|boundary/i);

    // F-06 negative check: real unallowed write inside isolated probe to hostHomeDir MUST be blocked by Node --permission.
    await expect(
      ProducerArtifactTrace.runIsolatedProducerProbe({
        trace: box.trace,
        isolatedTmpDir: isolatedTmp,
        allowedHostDirs: [hostStateDir],
        observedRoots: [corpus.root, cleanRepo],
        hostHomeDir,
        hostXdgDir,
        entryModuleUrl: pathToFileURL(join(liveRoot, "dist", "integration.js")).href,
        contractsModuleUrl: pathToFileURL(join(liveRoot, "dist", "contracts.js")).href,
        batchCodecModuleUrl: pathToFileURL(join(liveRoot, "dist", "batch-codec.js")).href,
        generationModuleUrl: pathToFileURL(join(liveRoot, "dist", "generation.js")).href,
        repoRoot: root,
        payload: { hostHomeDir, hostStateDir },
        scriptBody: `
          import { writeFileSync } from "node:fs";
          import { join } from "node:path";
          writeFileSync(join(DATA.payload.hostHomeDir, "real-escape.txt"), "leak");
        `,
      }),
    ).rejects.toThrow(/ERR_ACCESS_DENIED|Access to this API has been restricted/i);

    // F-06 negative check: real stray file written inside probeDir MUST be detected by assertBoundaryClean().
    const strayProbeResult = await ProducerArtifactTrace.runIsolatedProducerProbe({
      trace: box.trace,
      isolatedTmpDir: isolatedTmp,
      allowedHostDirs: [hostStateDir],
      observedRoots: [corpus.root, cleanRepo],
      hostHomeDir,
      hostXdgDir,
      entryModuleUrl: pathToFileURL(join(liveRoot, "dist", "integration.js")).href,
      contractsModuleUrl: pathToFileURL(join(liveRoot, "dist", "contracts.js")).href,
      batchCodecModuleUrl: pathToFileURL(join(liveRoot, "dist", "batch-codec.js")).href,
      generationModuleUrl: pathToFileURL(join(liveRoot, "dist", "generation.js")).href,
      repoRoot: root,
      payload: { hostStateDir },
      scriptBody: `
        import { writeFileSync } from "node:fs";
        writeFileSync("stray-cwd-file.txt", "leak");
      `,
    });
    expect(() => strayProbeResult.assertBoundaryClean()).toThrow(/probeDir|unexpected|boundary/i);
  }, 25_000);

  it("F-01/F-09: ProducerArtifactTrace avoids stdin.close hang on destroyed stdin, bounds stalled probes, and throws on signaled spawn", async () => {
    const box = createSandbox();
    const hooksDir = join(box.root, "disabled-hooks");
    const hostStateDir = join(box.root, "host-state");
    const hostHomeDir = join(box.root, "host-home");
    const hostXdgDir = join(box.root, "host-xdg");
    const isolatedTmp = join(box.root, "isolated-tmp");
    for (const d of [hooksDir, hostStateDir, hostHomeDir, hostXdgDir, isolatedTmp]) {
      mkdirSync(d, { recursive: true });
    }
    const trace = trackTrace(new ProducerArtifactTrace({
      trace: box.trace,
      allowedHostDirs: [hostStateDir],
      observedRoots: [],
      isolatedTmpDir: isolatedTmp,
    }));
    const gitPort = trace.wrapGitPort({ disabledHooksDir: hooksDir });

    // 1. F-09: Signal-terminated synchronous spawn must throw reporting the signal rather than mapping to status 1.
    expect(() =>
      gitPort.spawn(process.execPath, ["-e", "process.kill(process.pid, 'SIGKILL')"], { cwd: box.root }),
    ).toThrow(/SIGKILL/);

    // 2. F-01: stdin.close() on already-destroyed stream after abort() must resolve immediately instead of hanging forever,
    //    and stdin.write() on a destroyed/closed stream must reject immediately.
    const proc = await gitPort.process.start({
      purpose: "cat-file",
      cwd: box.root,
      args: ["hash-object", "--stdin"],
    });
    await proc.abort(new Error("abort test"));
    let closeTimeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        proc.stdin.close(),
        new Promise<never>((_, reject) => {
          closeTimeoutId = setTimeout(() => reject(new Error("stdin.close() hung")), 1_000);
          closeTimeoutId.unref?.();
        }),
      ]);
    } finally {
      if (closeTimeoutId !== undefined) clearTimeout(closeTimeoutId);
    }
    await expect(proc.stdin.write(new TextEncoder().encode("after-abort"))).rejects.toThrow(/closed or destroyed/i);

    // 3. F-01: dispose() reaps unawaited streaming child processes promptly.
    const unawaitedProc = await gitPort.process.start({
      purpose: "cat-file",
      cwd: box.root,
      args: ["cat-file", "--batch"],
    });
    await trace.dispose();
    let reapTimeoutId: ReturnType<typeof setTimeout> | undefined;
    const reapedExit = await Promise.race([
      unawaitedProc.exit,
      new Promise<never>((_, reject) => {
        reapTimeoutId = setTimeout(() => reject(new Error("dispose() did not reap child")), 1_000);
        reapTimeoutId.unref?.();
      }),
    ]).finally(() => {
      if (reapTimeoutId !== undefined) clearTimeout(reapTimeoutId);
    });
    expect(reapedExit.code).not.toBe(0);

    // 4. R2-02: single killTimer timeout source on wrapGitPort and __tracedGitPort rejects with timeout error.
    const timedOutGitPort = trace.wrapGitPort({ disabledHooksDir: hooksDir, processTimeoutMs: 120 });
    const timedOutProc = await timedOutGitPort.process.start({
      purpose: "cat-file",
      cwd: box.root,
      args: ["cat-file", "--batch"],
    });
    await expect(timedOutProc.exit).rejects.toThrow(/timed out after 120ms/i);

    await ProducerArtifactTrace.runIsolatedProducerProbe({
      trace: box.trace,
      isolatedTmpDir: isolatedTmp,
      allowedHostDirs: [hostStateDir],
      observedRoots: [],
      hostHomeDir,
      hostXdgDir,
      entryModuleUrl: pathToFileURL(join(liveRoot, "dist", "integration.js")).href,
      contractsModuleUrl: pathToFileURL(join(liveRoot, "dist", "contracts.js")).href,
      batchCodecModuleUrl: pathToFileURL(join(liveRoot, "dist", "batch-codec.js")).href,
      generationModuleUrl: pathToFileURL(join(liveRoot, "dist", "generation.js")).href,
      repoRoot: root,
      payload: { hooksDir, cwd: box.root },
      timeoutMs: 5_000,
      scriptBody: `
        const git = DATA.tracedGitPort({ disabledHooksDir: DATA.payload.hooksDir, processTimeoutMs: 120 });
        const child = await git.process.start({
          purpose: "cat-file",
          cwd: DATA.payload.cwd,
          args: ["cat-file", "--batch"],
        });
        let timeoutMsg = "";
        try {
          await child.exit;
        } catch (err) {
          timeoutMsg = err instanceof Error ? err.message : String(err);
        }
        if (!/timed out after 120ms/i.test(timeoutMsg)) {
          throw new Error("Expected __tracedGitPort timeout rejection, got: " + timeoutMsg);
        }
      `,
    });

    // 5. F-01: Stalled isolated producer probe must reject within timeoutMs instead of blocking synchronously.
    const startedAt = Date.now();
    await expect(
      ProducerArtifactTrace.runIsolatedProducerProbe({
        trace: box.trace,
        isolatedTmpDir: isolatedTmp,
        allowedHostDirs: [hostStateDir],
        observedRoots: [],
        hostHomeDir,
        hostXdgDir,
        entryModuleUrl: pathToFileURL(join(liveRoot, "dist", "integration.js")).href,
        contractsModuleUrl: pathToFileURL(join(liveRoot, "dist", "contracts.js")).href,
        batchCodecModuleUrl: pathToFileURL(join(liveRoot, "dist", "batch-codec.js")).href,
        generationModuleUrl: pathToFileURL(join(liveRoot, "dist", "generation.js")).href,
        repoRoot: root,
        payload: {},
        timeoutMs: 250,
        scriptBody: `
          await new Promise((r) => setTimeout(r, 3_000));
        `,
      }),
    ).rejects.toThrow(/timed out|timeout|SIGKILL/i);
    expect(Date.now() - startedAt).toBeLessThan(1_800);
  }, 15_000);
});
