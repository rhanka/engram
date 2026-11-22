// L9-E — Producer Compatibility And Independent Corpus Preservation
// (spec/SPEC_LIVE_GIT_INDEXING.md §§2, 11, A07/A13; plan/09-BRANCH_LIVE_GIT_INDEXING.md L9-E).

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import {
  CONTENT_POLICY_VERSION,
  CONTRACT_VERSION,
  POLICY_VERSION,
  validateFactBatch,
  validateLiveFact,
  type CodeAnalysisFactDto,
  type CoverageFactDto,
  type FactBatchDto,
  type FactSinkPort,
  type HistoryCheckpointDto,
  type HistoryCommitFactDto,
  type HistoryCompletionQuery,
  type HistoryCompletionState,
  type LiveScope,
  type LocalSnapshotDto,
  type QualifiedOid,
  type ReasonAnchorFactDto,
  type RetainedRootDto,
  type ScopeFencingTokenDto,
} from "../engram-live/contracts.js";
import {
  classifyFactPrivacy,
  describeFact,
} from "../engram-live/facts.js";
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
  reviseLiveDeclaration,
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
import { DEFAULT_ENGRAM_STATE_DIR } from "../src/paths.js";
import { rebuildCode } from "../src/watch.js";
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

interface CompatibilityFixture {
  extractorVersion: string;
  base: {
    language: string;
    path: string;
    treeOid: string;
    configHash: string;
    dependencyHash: string;
  };
  contents: {
    v1: string;
    "v2-body-only": string;
  };
  producerCompatibility: {
    warning: string;
    corpusAnnotations: {
      nodeId: string;
      description: string;
      citations: ReadonlyArray<{ source_file: string; page: number; note?: string }>;
      communityLabel: string;
      graphProvenance: {
        source_owner: string;
        source_id: string;
        source_hash: string;
        adapter_version: string;
        input_digest: string;
        observed_at: string;
      };
    };
    sourceSnippetPath: string;
    sourceSnippet: string;
  };
}

const fixture = JSON.parse(
  readFileSync(join(root, "tests", "fixtures", "live-code-context.json"), "utf8"),
) as CompatibilityFixture;

const sandboxes: LiveGitSandbox[] = [];
const tempDirs: string[] = [];
const traces: ProducerArtifactTrace[] = [];
const virtualClocks: VirtualScheduleClock[] = [];
const activeFactories: Array<{ disable(req?: { reason?: "owner-request" | "policy-withdrawn" | "workspace-remove"; generationId?: string }): Promise<unknown> }> = [];
function createSandbox(): LiveGitSandbox {
  const box = new LiveGitSandbox();
  sandboxes.push(box);
  return box;
}
function createTempProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "engram-l9e-project-"));
  tempDirs.push(dir);
  return dir;
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
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
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
  box: LiveGitSandbox;
  hooksDir: string;
  declaration: ReturnType<typeof createLiveDeclaration>;
  trace: ProducerArtifactTrace;
  nowRef: { now: number };
}) {
  const deliveredBatches: Array<{ batch: FactBatchDto; token: ScopeFencingTokenDto }> = [];
  const committedHistoryFacts: HistoryCommitFactDto[] = [];
  const retainedRoots = new Map<string, RetainedRootDto>();
  const checkpoints = new Map<string, HistoryCheckpointDto>();
  const cacheEntries = new Map<string, string>();
  const latestStore = new Map<string, LocalSnapshotDto>();
  const blockedGenerations = new Set<string>();
  const keyVersions = new Map<string, boolean>([["key:l9e:1", true]]);
  let purges = 0;

  const factSink: FactSinkPort = {
    async deliver(batch, token) {
      const checked = validateFactBatch(batch);
      if (!checked.ok) {
        throw new Error(`invalid batch delivered to fake sink: ${checked.errors.join("; ")}`);
      }
      const encoded = encodeFactBatch(batch);
      const decoded = decodeFactBatch(encoded.bytes);
      if (decoded.batchDigest !== batch.batchDigest) {
        throw new Error("batch codec round-trip digest mismatch");
      }
      deliveredBatches.push({ batch: decoded, token });
      return {
        received: true,
        batchId: batch.batchId,
        receiptId: `rcpt:${deliveredBatches.length}`,
        retiredSuperseded: true,
        revokedDecryptability: true,
      };
    },
  };

  const cache: CachePort & { authorizedScopes: LiveScope[] } = {
    authorizedScopes: [],
    authorize(scope) {
      if (scope.tenant !== options.declaration.tenant || scope.clone !== options.declaration.cloneId) {
        throw new Error("cache scope denied");
      }
      this.authorizedScopes.push(scope);
    },
    async load(key) {
      return cacheEntries.get(key) ?? null;
    },
    async store(key, value) {
      cacheEntries.set(key, value);
    },
  };

  const protection: ContentProtectionPort = {
    async protect(plaintext) {
      const sealed = Uint8Array.from(plaintext, (b, i) => b ^ ((i + 0x5a) & 0xff));
      return {
        state: "sealed",
        algorithm: "fake-seal/1",
        keyRef: "key:l9e:1",
        ciphertext: sealed,
      };
    },
  };

  const latestSnapshots: LatestSnapshotPort = {
    async loadLatest(query: LatestSnapshotQuery) {
      const key = `${query.scope.tenant}:${query.scope.clone}:${query.worktreeId}:${query.kind}:${query.diffKind}`;
      return latestStore.get(key) ?? null;
    },
    async replaceLatest(snapshot: LocalSnapshotDto, expectedSupersededId: string | null, generationId: string): Promise<ReplaceLatestReceipt> {
      if (blockedGenerations.has(generationId)) {
        throw new Error("stale generation blocked after unregister purge");
      }
      const key = `${snapshot.scope.tenant}:${snapshot.scope.clone}:${snapshot.worktreeId}:${snapshot.kind}:${snapshot.diffKind}`;
      const prev = latestStore.get(key) ?? null;
      if ((prev?.snapshotId ?? null) !== expectedSupersededId) {
        throw new Error("predecessor mismatch");
      }
      latestStore.set(key, snapshot);
      return {
        received: true,
        retiredPrevious: true,
        revokedDecryptability: true,
        blockedStaleWork: true,
      };
    },
    async purgePrivate(query: LatestSnapshotScope): Promise<PurgePrivateReceipt> {
      purges += 1;
      for (const key of [...latestStore.keys()]) {
        if (key.startsWith(`${query.scope.tenant}:${query.scope.clone}:${query.worktreeId}:`)) {
          latestStore.delete(key);
        }
      }
      keyVersions.set("key:l9e:1", false);
      return {
        purgedPrivate: true,
        blockedOldWork: true,
        revokedDecryptability: true,
      };
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

  const incarnation = "inc:l9e:1";
  const markers = new Map<string, string>();
  const issuedTokens = new Map<string, { revoked: boolean; token: ScopeFencingTokenDto }>();
  let seq = 0;

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
      issuedTokens.set(token.tokenId, { revoked: false, token });
      return token;
    },
    async renew(token) {
      const rec = issuedTokens.get(token.tokenId);
      if (!rec || rec.revoked) return undefined;
      return { ...token, expiresAt: options.nowRef.now + 600_000 };
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

  const publishedGens = new Set<string>();
  const markerStore: MarkerStore = {
    get: (key) => markers.get(key),
    set: (key, value) => { markers.set(key, value); },
    delete: (key) => { markers.delete(key); },
    incarnation: () => incarnation,
    hasGeneration: (inc, genId) => inc === incarnation && publishedGens.has(genId),
  };

  const sourceVector: SourceVector = {
    refsFingerprint: sha256Hex("refs:l9e"),
    headOid: "a".repeat(40),
    indexFingerprint: sha256Hex("index:l9e"),
    pathMembershipFingerprint: sha256Hex("paths:l9e"),
    contentFingerprint: sha256Hex("content:l9e"),
    configAttributesFingerprint: sha256Hex("cfg:l9e"),
    lockStateValid: true,
  };

  const scan: ReconcileScan = {
    async discoverPage() {
      return {
        entries: [{ path: "src/shop/cart.ts", statSize: 64, contentFingerprint: sha256Hex("src/shop/cart.ts") }],
        deletedPaths: [],
        nextCursor: undefined,
        done: true,
        complete: true,
      };
    },
    async collectPaths(paths) {
      return { collected: [...paths], receiptId: `collect:${paths.length}`, complete: true };
    },
    async repairRelations() {
      return { receiptId: "repair:1", complete: true };
    },
    async validateSource(expected) {
      return {
        valid: true,
        projectionMatches: true,
        sourceVector: expected,
        validatedAt: options.nowRef.now,
        axes: Object.fromEntries(
          [
            "refs",
            "dag",
            "pr-metadata",
            "object-availability",
            "pr-attribution",
            "ast",
            "index",
            "working-tree",
            "remote-publication",
            "line-attribution",
            "symbol-correspondence",
          ].map((axis) => [axis, { complete: true }]),
        ),
      };
    },
    async publishGeneration(request) {
      publishedGens.add(request.generationId);
      return {
        published: true,
        generationId: request.generationId,
        incarnation,
        receiptId: `pub:${request.generationId}`,
      };
    },
    currentSourceVector: () => sourceVector,
    pathFingerprint: (path) => sha256Hex(path),
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

  const ports = {
    git: options.trace.wrapGitPort({ disabledHooksDir: options.hooksDir }),
    filesystem: {
      async readFileBytes(path: string) {
        return new Uint8Array(readFileSync(path));
      },
    },
    clock: {
      now: () => options.nowRef.now,
      schedule: (ms: number, cb: () => void) => {
        virtualClock.setNow(options.nowRef.now);
        return virtualClock.schedule(ms, cb);
      },
    },
    content: {
      protection,
      keyProvider: {
        async currentKeyRef() {
          if (keyVersions.get("key:l9e:1") !== true) {
            return { state: "unavailable" as const, reason: "key revoked" };
          }
          return { state: "available" as const, keyRef: "key:l9e:1" };
        },
      },
      latestSnapshots,
    },
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
  };

  return {
    ports,
    virtualClock,
    deliveredBatches,
    committedHistoryFacts,
    latestStore,
    keyVersions,
    incarnation,
    sourceVector,
    getPurgeCount: () => purges,
  };
}

function makeCommittedRepoObjects(sourcePath: string, content: string, commitMessage = "compatibility source commit\n") {
  const blobBody = Buffer.from(content, "utf8");
  const blobOid = createHash("sha1")
    .update(`blob ${blobBody.length}\0`)
    .update(blobBody)
    .digest("hex");

  // Single-segment / nested tree builder so verifyCommitGraph + verifyGitObject pass deterministically.
  const objects = new Map<string, { type: string; body: Buffer }>();
  const put = (type: string, body: Buffer): QualifiedOid => {
    const oid = createHash("sha1").update(`${type} ${body.length}\0`).update(body).digest("hex");
    objects.set(oid, { type, body });
    return { algorithm: "sha1", oid };
  };

  const blob = put("blob", blobBody);
  expect(blob.oid).toBe(blobOid);

  const parts = sourcePath.split("/");
  let currentOid = blob.oid;
  let currentMode = "100644";
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const name = parts[i]!;
    const treeBody = Buffer.concat([
      Buffer.from(`${currentMode} ${name}\0`, "utf8"),
      Buffer.from(currentOid, "hex"),
    ]);
    currentOid = put("tree", treeBody).oid;
    currentMode = "40000";
  }
  const tree: QualifiedOid = { algorithm: "sha1", oid: currentOid };
  const commitBody = Buffer.from(
    [
      `tree ${tree.oid}`,
      "author L9-E <l9e@example.test> 1700000000 +0000",
      "committer L9-E <l9e@example.test> 1700000000 +0000",
      "",
      commitMessage,
    ].join("\n"),
    "utf8",
  );
  const commit = put("commit", commitBody);

  return {
    blob,
    tree,
    commit,
    objectsPort: {
      async loadBlob(oid: string) {
        const entry = objects.get(oid);
        return entry?.type === "blob" ? new Uint8Array(entry.body) : null;
      },
      async loadObject(oid: string) {
        const entry = objects.get(oid);
        return entry ? { type: entry.type, body: new Uint8Array(entry.body) } : null;
      },
    },
  };
}

describe("L9-E producer compatibility and neutrality boundary", () => {
  beforeAll(() => ensureAssembledDistFresh(root));

  it("committed compatibility facts preserve corpus annotations and source provenance through a fake sink", async () => {
    const box = createSandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const hooksDir = join(box.root, "disabled-hooks");
    const hostStateDir = join(box.root, "host-state");
    mkdirSync(hooksDir, { recursive: true });
    mkdirSync(hostStateDir, { recursive: true });

    // Create an independent file-corpus store (.engram/graph.json + citations.json)
    // inside an isolated project directory with rich human/enrichment annotations.
    const projectDir = createTempProjectDir();
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(
      join(projectDir, fixture.producerCompatibility.sourceSnippetPath),
      fixture.producerCompatibility.sourceSnippet,
      "utf8",
    );
    box.init(projectDir);
    box.git(projectDir, ["add", "."]);
    box.git(projectDir, ["commit", "-q", "-m", "init project"]);
    const engramDir = join(projectDir, DEFAULT_ENGRAM_STATE_DIR);
    mkdirSync(join(engramDir, "ontology"), { recursive: true });
    const preRebuildOk = await rebuildCode(projectDir, false, {});
    expect(preRebuildOk).toBe(true);

    const graphPath = join(engramDir, "graph.json");
    const seededGraph = JSON.parse(readFileSync(graphPath, "utf8")) as {
      nodes: Array<Record<string, unknown>>;
      community_labels?: Record<string, string>;
      provenance?: Record<string, unknown>;
    };
    const targetNode = seededGraph.nodes.find(
      (n) => String(n.source_file ?? "").includes("cart") || String(n.id ?? "").includes("add"),
    ) ?? seededGraph.nodes[0]!;
    expect(targetNode).toBeDefined();
    targetNode.description = fixture.producerCompatibility.corpusAnnotations.description;
    targetNode.citations = fixture.producerCompatibility.corpusAnnotations.citations;
    seededGraph.provenance = fixture.producerCompatibility.corpusAnnotations.graphProvenance;
    writeFileSync(graphPath, JSON.stringify(seededGraph, null, 2), "utf8");
    const graphBefore = readFileSync(graphPath, "utf8");
    const citationsPath = join(engramDir, "ontology", "citations.json");
    writeFileSync(
      citationsPath,
      JSON.stringify({
        [String(targetNode.id)]: fixture.producerCompatibility.corpusAnnotations.citations,
      }),
      "utf8",
    );
    const citationsBefore = readFileSync(citationsPath, "utf8");

    // Seed identical annotations inside the Git corpus worktree as well so we prove
    // live producer cycles through the assembled factory leave .engram/ untouched there too.
    const corpusEngramDir = join(corpus.repo, DEFAULT_ENGRAM_STATE_DIR);
    mkdirSync(join(corpusEngramDir, "ontology"), { recursive: true });
    const corpusGraphSnapshot = graphBefore;
    writeFileSync(join(corpusEngramDir, "graph.json"), corpusGraphSnapshot, "utf8");
    writeFileSync(join(corpusEngramDir, "ontology", "citations.json"), citationsBefore, "utf8");
    const digestBefore = inventoryDigest(corpus);

    const commonDirRealpath = realpathSync(join(corpus.repo, ".git"));
    const mainGitDir = box.git(corpus.repo, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
    const clone = deriveCloneIdentity({
      hostScope: "host:l9e",
      commonDirRealpath,
      commonDirProjectFingerprint: "fp:l9e:clone",
      oidAlgorithm: "sha1",
    });
    const worktree = deriveWorktreeIdentity({
      hostScope: "host:l9e",
      clone,
      worktreePath: corpus.repo,
      gitDir: mainGitDir,
      worktreeFingerprint: "fp:l9e:wt",
    });
    const declIds = deriveDeclarationIdentity({
      hostScope: "host:l9e",
      clone,
      worktree,
    });
    const initialDecl = createLiveDeclaration({
      tenant: "local:l9e-owner",
      principal: "local:l9e-principal",
      hostFingerprint: "l9e-host-fp",
      identityUncertainty: [],
      declarationId: declIds.declarationId,
      cloneId: clone.cloneId,
      worktreeId: worktree.worktreeId,
      authorizedRoots: [corpus.repo],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
    });
    const declaration = reviseLiveDeclaration(initialDecl, {
      authorizedRoots: [corpus.repo, corpus.linked],
    });
    expect(declaration.declarationRevision).toBe(2);

    const nowRef = { now: 1_700_000_000_000 + 5 * 86_400_000 };
    const trace = trackTrace(new ProducerArtifactTrace({
      trace: box.trace,
      allowedHostDirs: [hooksDir, hostStateDir],
      observedRoots: [corpus.root, projectDir],
    }));
    const fake = makeFakePorts({
      box,
      hooksDir,
      declaration,
      trace,
      nowRef,
    });

    // Import through the assembled built entry to verify packaged behavior end-to-end.
    const distIntegration = (await import(
      pathToFileURL(join(liveRoot, "dist", "integration.js")).href
    )) as typeof import("../engram-live/integration.js");
    const factory = distIntegration.createLiveFactory({
      declaration,
      ports: fake.ports,
    });
    activeFactories.push(factory);

    const cloneToken: ScopeFencingTokenDto = {
      tokenId: "tok:clone:l9e:1",
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
      tokenId: "tok:wt:l9e:1",
      scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
    };

    // 1. Scan: refs + history-dag + committed code-analysis with full source provenance
    const refsRes = await factory.runCapability("refs", {
      cwd: corpus.repo,
      defaultBranch: "refs/heads/main",
      generationId: formatProducerGenerationId(1),
      fencingToken: cloneToken,
    });
    expect(refsRes).toMatchObject({ capability: "refs", state: "available", delivered: true });

    const repository = observeRepository({
      hostScope: "host:l9e",
      commonDirRealpath,
      commonDirProjectFingerprint: "fp:l9e:clone",
      oidAlgorithm: "sha1",
      worktrees: [
        {
          worktreePath: corpus.repo,
          gitDir: mainGitDir,
          worktreeFingerprint: "fp:l9e:wt",
          head: { kind: "branch", refName: "refs/heads/main" },
        },
      ],
    });
    const historyRes = await factory.runCapability("history-dag", {
      cwd: corpus.repo,
      repository,
      defaultBranch: "refs/heads/main",
      generationId: formatProducerGenerationId(2),
      fencingToken: cloneToken,
    });
    expect(historyRes, JSON.stringify(historyRes)).toMatchObject({ capability: "history-dag", state: "available", delivered: true });

    const analysisPath = fixture.base.path;
    const analysisContent = fixture.contents.v1;
    const committedObjects = makeCommittedRepoObjects(analysisPath, analysisContent);
    const codeAnalysisRes = await factory.runCapability("code-analysis", {
      input: {
        scope: { tenant: declaration.tenant, clone: declaration.cloneId },
        language: fixture.base.language,
        path: analysisPath,
        content: analysisContent,
        treeOid: committedObjects.tree.oid,
        configHash: fixture.base.configHash,
        dependencyHash: fixture.base.dependencyHash,
        historicalBounds: { known: true, heads: [committedObjects.commit] },
      },
      objects: committedObjects.objectsPort,
      generationId: formatProducerGenerationId(3),
      fencingToken: cloneToken,
      expectedIncarnation: fake.incarnation,
      commit: committedObjects.commit,
      blob: committedObjects.blob,
      reasonAnchors: [
        {
          anchorKind: "code",
          commit: committedObjects.commit,
          blob: committedObjects.blob,
          path: Buffer.from(analysisPath, "utf8"),
          range: { start: 1, end: 3 },
          calculationVersion: "live-line-attribution/1",
        },
      ],
    });
    expect(codeAnalysisRes.state).toBe("available");
    expect(codeAnalysisRes.delivered).toBe(true);
    if (codeAnalysisRes.state === "available") {
      expect(codeAnalysisRes.analysis?.state).toBe("complete");
      expect(codeAnalysisRes.generationId).toBe(formatProducerGenerationId(3));
      expect(codeAnalysisRes.batches?.length).toBeGreaterThanOrEqual(1);
    }

    // Also run private working-tree snapshot to verify separation from committed facts.
    const wtRes = await factory.runCapability("working-tree", {
      cwd: corpus.repo,
      generationId: formatProducerGenerationId(4),
      fencingToken: worktreeToken,
    });
    expect(wtRes, JSON.stringify(wtRes)).toMatchObject({ capability: "working-tree", state: "available", delivered: true });
    expect(fake.latestStore.size).toBeGreaterThan(0);

    // 2. Reconciliation + Reads + Restart
    const recRes = await factory.runCapability("reconciliation", {
      generationId: formatProducerGenerationId(5),
      action: "converge",
    });
    expect(recRes, JSON.stringify(recRes)).toMatchObject({ capability: "reconciliation", state: "available", converged: true });
    expect(factory.describeCapabilities()).toHaveLength(10);
    expect(factory.grammarCoverage("typescript").state).toBe("current");
    const restartRes = await factory.runCapability("reconciliation", {
      generationId: formatProducerGenerationId(6),
      action: "restart",
    });
    expect(restartRes, JSON.stringify(restartRes)).toMatchObject({ capability: "reconciliation", state: "available" });

    // 3. Verify committed compatibility facts in fake sink preserve provenance & schema
    const committedFacts = fake.deliveredBatches
      .filter((entry) => entry.batch.policyVersion === POLICY_VERSION)
      .flatMap((entry) => entry.batch.facts);
    const analysisFact = committedFacts.find((f): f is CodeAnalysisFactDto => f.kind === "code-analysis");
    expect(analysisFact).toBeDefined();
    expect(analysisFact!.cloneId).toBe(declaration.cloneId);
    expect(analysisFact!.worktreeId).toBeNull();
    expect(analysisFact!.snapshotId).toBeNull();
    expect(analysisFact!.tree).toEqual(committedObjects.tree);
    expect(analysisFact!.blob).toEqual(committedObjects.blob);
    expect(Buffer.from(analysisFact!.path).toString("utf8")).toBe(analysisPath);
    expect(analysisFact!.contentHash).toBe(sha256Hex(analysisContent));
    expect(analysisFact!.grammarVersion).toBeTruthy();
    expect(analysisFact!.grammarDigest).toBeTruthy();
    expect(analysisFact!.symbols.length).toBeGreaterThan(0);
    expect(describeFact(analysisFact!).privacy).toBe("committed");
    expect(classifyFactPrivacy(analysisFact!)).toBe("committed");

    const anchorFact = committedFacts.find((f): f is ReasonAnchorFactDto => f.kind === "reason-anchor");
    expect(anchorFact).toBeDefined();
    expect(anchorFact!.anchorKind).toBe("code");
    if (anchorFact!.anchorKind === "code") {
      expect(anchorFact!.commit).toEqual(committedObjects.commit);
      expect(anchorFact!.blob).toEqual(committedObjects.blob);
      expect(Buffer.from(anchorFact!.path).toString("utf8")).toBe(analysisPath);
      expect(anchorFact!.range).toEqual({ start: 1, end: 3 });
    }
    const coverageAst = committedFacts.find(
      (f): f is CoverageFactDto => f.kind === "coverage" && f.axis === "ast",
    );
    expect(coverageAst?.state).toBe("current");

    // 4. Disable lifecycle purges private snapshots & decryptability while preserving committed facts!
    const committedCountBeforeDisable = fake.deliveredBatches.filter(
      (entry) => entry.batch.policyVersion === POLICY_VERSION,
    ).length;
    const disableRes = await factory.disable({
      reason: "policy-withdrawn",
      generationId: formatProducerGenerationId(7),
    });
    expect(disableRes).toMatchObject({
      disabled: true,
      declarationId: declaration.declarationId,
      cloneId: declaration.cloneId,
      worktreeId: declaration.worktreeId,
      shutdownCompleted: true,
      preservedCommittedHistory: true,
    });
    expect(disableRes.purgeOutcome).toMatchObject({
      stoppedWork: true,
      rejectedDelayedJobs: true,
      purgedPrivate: true,
      preservedCommittedHistory: true,
    });
    expect(fake.getPurgeCount()).toBe(1);
    expect(fake.latestStore.size).toBe(0);
    expect(fake.keyVersions.get("key:l9e:1")).toBe(false);
    expect(
      fake.deliveredBatches.filter((entry) => entry.batch.policyVersion === POLICY_VERSION).length,
    ).toBe(committedCountBeforeDisable);

    // Disabled factory refuses subsequent capability execution without writing anything.
    const postDisable = await factory.runCapability("refs", {
      cwd: corpus.repo,
      defaultBranch: "refs/heads/main",
      generationId: formatProducerGenerationId(8),
      fencingToken: cloneToken,
    });
    expect(postDisable).toMatchObject({ capability: "refs", state: "unavailable", delivered: false });

    // 5. Independent file-corpus annotations & provenance remain intact on disk AND across live rebuildCode!
    expect(readFileSync(join(corpusEngramDir, "graph.json"), "utf8")).toBe(corpusGraphSnapshot);
    expect(readFileSync(join(corpusEngramDir, "ontology", "citations.json"), "utf8")).toBe(citationsBefore);
    expect(inventoryDigest(corpus)).toBe(digestBefore);

    // Live rebuildCode on the independent annotated project preserves description & citations deterministically.
    expect(await rebuildCode(projectDir, false, {})).toBe(true);
    const afterGraph = JSON.parse(readFileSync(graphPath, "utf8")) as {
      nodes: Array<Record<string, unknown>>;
    };
    const rebuiltNode = afterGraph.nodes.find((n) => n.id === targetNode.id);
    expect(rebuiltNode?.description).toBe(fixture.producerCompatibility.corpusAnnotations.description);
    expect(rebuiltNode?.citations).toEqual(fixture.producerCompatibility.corpusAnnotations.citations);
    const afterCitations = JSON.parse(readFileSync(citationsPath, "utf8")) as {
      schema: string;
      nodes: Record<string, { count: number; citations: unknown[] }>;
    };
    expect(afterCitations.schema).toBe("engram_ontology_citations_v1");
    expect(afterCitations.nodes[String(targetNode.id)]?.citations).toEqual(
      fixture.producerCompatibility.corpusAnnotations.citations,
    );
    expect(fake.virtualClock.pendingCount()).toBe(0);
  }, 25_000);

  it("compatibility contains no private snapshot export database reader or host import", async () => {
    // 1. Static AST closure over engram-live source & emitted dist: zero DB readers, host imports, or live file exporters.
    const forbiddenPackages = new Set([
      "better-sqlite3",
      "sqlite3",
      "node:sqlite",
      "sqlite",
      "pg",
      "pg-pool",
      "libsql",
      "@libsql/client",
      "fs-ext",
      "@sentropic/engram",
      "@sentropic/engram-memory",
      "@sentropic/cluster-mesh",
      "cluster-mesh",
      "h2a",
      "sentropic",
      "ai",
      "@ai-sdk/anthropic",
      "@ai-sdk/openai",
      "openai",
      "@anthropic-ai/sdk",
    ]);
    const forbiddenExportCalls = new Set([
      "toJson",
      "persistGraphWithCitations",
      "toCypher",
      "toSpanner",
      "pushToNeo4j",
    ]);

    const scanTargets: string[] = [];
    const collectScanFiles = (dir: string, skipDirs: ReadonlySet<string>): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (skipDirs.has(entry.name)) continue;
          collectScanFiles(join(dir, entry.name), skipDirs);
          continue;
        }
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".js")) continue;
        scanTargets.push(join(dir, entry.name));
      }
    };
    collectScanFiles(liveRoot, new Set(["dist", "grammars", "node_modules"]));
    collectScanFiles(join(liveRoot, "dist"), new Set(["grammars", "node_modules"]));
    expect(scanTargets.length).toBeGreaterThan(25);
    expect(scanTargets.some((p) => p.includes("/dist/reused/extract-core.js") || p.includes("\\dist\\reused\\extract-core.js"))).toBe(true);

    for (const filePath of scanTargets) {
      const text = readFileSync(filePath, "utf8");
      const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
      const specifiers: string[] = [];
      const callNames: string[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
            specifiers.push(node.moduleSpecifier.text);
          }
        } else if (ts.isCallExpression(node)) {
          if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
            specifiers.push(node.arguments[0].text);
          } else if (ts.isIdentifier(node.expression)) {
            callNames.push(node.expression.text);
            if (node.expression.text === "require" && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
              specifiers.push(node.arguments[0].text);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);

      for (const spec of specifiers) {
        expect(forbiddenPackages.has(spec), `${filePath} must never import ${spec}`).toBe(false);
        if (spec.startsWith(".")) {
          const resolved = resolve(dirname(filePath), spec);
          expect(
            resolved.startsWith(liveRoot + "/") || resolved === liveRoot,
            `${filePath} relative edge ${spec} must stay inside engram-live`,
          ).toBe(true);
        }
      }
      for (const name of callNames) {
        expect(forbiddenExportCalls.has(name), `${filePath} must never call host exporter ${name}`).toBe(false);
      }
      expect(text, `${filePath} must never reference global-graph.json`).not.toContain("global-graph.json");
    }

    // 2. Runtime compatibility boundary refuses private snapshot leaks into committed delivery.
    const box = createSandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const hooksDir = join(box.root, "disabled-hooks");
    mkdirSync(hooksDir, { recursive: true });
    const declaration = createLiveDeclaration({
      tenant: "local:l9e-owner",
      principal: "local:l9e-principal",
      hostFingerprint: "l9e-host-fp",
      identityUncertainty: [],
      declarationId: "decl:l9e:boundary",
      cloneId: "clone:l9e:boundary",
      worktreeId: "wt:l9e:boundary",
      authorizedRoots: [corpus.repo],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
    });
    const nowRef = { now: 1_700_000_000_000 };
    const trace = trackTrace(new ProducerArtifactTrace({
      trace: box.trace,
      allowedHostDirs: [hooksDir],
      observedRoots: [corpus.root],
    }));
    const fake = makeFakePorts({ box, hooksDir, declaration, trace, nowRef });
    const distIntegration = (await import(
      pathToFileURL(join(liveRoot, "dist", "integration.js")).href
    )) as typeof import("../engram-live/integration.js");
    const factory = distIntegration.createLiveFactory({ declaration, ports: fake.ports });
    activeFactories.push(factory);

    const cloneToken: ScopeFencingTokenDto = {
      tokenId: "tok:clone:guard2",
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
      tokenId: "tok:wt:guard2",
      scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
    };

    const obj = makeCommittedRepoObjects(fixture.base.path, fixture.contents.v1);

    // a) Committed analysis cannot use a worktree-scoped token (blocks private-scope bleed).
    const wtTokenOnCommitted = await factory.runCapability("code-analysis", {
      input: {
        scope: { tenant: declaration.tenant, clone: declaration.cloneId },
        language: fixture.base.language,
        path: fixture.base.path,
        content: fixture.contents.v1,
        treeOid: obj.tree.oid,
        configHash: fixture.base.configHash,
        dependencyHash: fixture.base.dependencyHash,
        historicalBounds: { known: true, heads: [obj.commit] },
      },
      objects: obj.objectsPort,
      generationId: formatProducerGenerationId(10),
      fencingToken: worktreeToken,
    });
    expect(wtTokenOnCommitted).toMatchObject({ capability: "code-analysis", state: "unavailable", delivered: false });

    // b) Committed analysis cannot attach snapshotId (blocks private snapshot export).
    const snapshotLeakOnCommitted = await factory.runCapability("code-analysis", {
      input: {
        scope: { tenant: declaration.tenant, clone: declaration.cloneId },
        language: fixture.base.language,
        path: fixture.base.path,
        content: fixture.contents.v1,
        treeOid: obj.tree.oid,
        snapshotId: "lsnap:" + "a".repeat(64),
        configHash: fixture.base.configHash,
        dependencyHash: fixture.base.dependencyHash,
        historicalBounds: { known: true, heads: [obj.commit] },
      },
      objects: obj.objectsPort,
      generationId: formatProducerGenerationId(11),
      fencingToken: cloneToken,
    });
    expect(snapshotLeakOnCommitted).toMatchObject({ capability: "code-analysis", state: "unavailable", delivered: false });

    // c) Local snapshot-bound analysis cannot smuggle committed reasonAnchors or commit provenance.
    const committedAnchorOnLocal = await factory.runCapability("code-analysis", {
      input: {
        scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
        language: fixture.base.language,
        path: fixture.base.path,
        content: fixture.contents.v1,
        treeOid: null,
        snapshotId: "lsnap:" + "b".repeat(64),
        worktreeId: declaration.worktreeId,
        configHash: fixture.base.configHash,
        dependencyHash: fixture.base.dependencyHash,
        historicalBounds: null,
      },
      objects: obj.objectsPort,
      generationId: formatProducerGenerationId(12),
      fencingToken: worktreeToken,
      reasonAnchors: [
        {
          anchorKind: "commit",
          commit: obj.commit,
        },
      ],
    });
    expect(committedAnchorOnLocal).toMatchObject({ capability: "code-analysis", state: "unavailable", delivered: false });
    expect(fake.deliveredBatches).toHaveLength(0);

    // d) Private L4b facts cannot cross a clone-scoped committed FactBatchDto boundary.
    const privateCoverage = {
      kind: "local-coverage",
      scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
      worktreeId: declaration.worktreeId,
      axis: "working-tree",
      state: "current",
      reason: "local-ok",
      checkedAt: nowRef.now,
      policyVersion: CONTENT_POLICY_VERSION,
    } as const;
    const smuggledBatch: FactBatchDto = {
      batchId: "batch:code-analysis:0000000001:000001",
      generationId: formatProducerGenerationId(13),
      scope: { tenant: declaration.tenant, clone: declaration.cloneId },
      producerName: "@sentropic/engram-live",
      contractVersion: CONTRACT_VERSION,
      policyVersion: POLICY_VERSION,
      batchDigest: "0".repeat(64),
      facts: [privateCoverage],
    };
    expect(validateFactBatch(smuggledBatch).ok).toBe(false);
    expect(validateLiveFact({ ...privateCoverage, policyVersion: POLICY_VERSION }).ok).toBe(false);
  }, 20_000);

  it("F-02: deterministic virtual clock avoids 1ms timer loops on reconciliation and clears timers on disable", async () => {
    const box = createSandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const hooksDir = join(box.root, "disabled-hooks");
    mkdirSync(hooksDir, { recursive: true });
    const declaration = createLiveDeclaration({
      tenant: "local:l9e-f02",
      principal: "local:l9e-f02-p",
      hostFingerprint: "l9e-f02-fp",
      identityUncertainty: [],
      declarationId: "decl:l9e:f02",
      cloneId: "clone:l9e:f02",
      worktreeId: "wt:l9e:f02",
      authorizedRoots: [corpus.repo],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
    });
    const nowRef = { now: 1_700_000_000_000 };
    const trace = trackTrace(new ProducerArtifactTrace({
      trace: box.trace,
      allowedHostDirs: [hooksDir],
      observedRoots: [corpus.root],
    }));
    const fake = makeFakePorts({ box, hooksDir, declaration, trace, nowRef });
    let pollCalls = 0;
    const basePollRefs = fake.ports.scheduling.pollRefs;
    fake.ports.scheduling.pollRefs = async () => {
      pollCalls += 1;
      return basePollRefs();
    };
    const distIntegration = (await import(
      pathToFileURL(join(liveRoot, "dist", "integration.js")).href
    )) as typeof import("../engram-live/integration.js");
    const factory = distIntegration.createLiveFactory({ declaration, ports: fake.ports });
    activeFactories.push(factory);
    try {
      const recRes = await factory.runCapability("reconciliation", {
        generationId: formatProducerGenerationId(1),
        action: "converge",
      });
      expect(recRes).toMatchObject({ capability: "reconciliation", state: "available", converged: true });
      const callsAfterConverge = pollCalls;
      expect(fake.virtualClock.pendingCount()).toBeGreaterThan(0);
      await new Promise((r) => setTimeout(r, 60));
      expect(pollCalls).toBe(callsAfterConverge);
    } finally {
      await factory.disable({ reason: "owner-request", generationId: formatProducerGenerationId(2) }).catch(() => undefined);
    }
    expect(fake.virtualClock.pendingCount()).toBe(0);
  }, 15_000);

  it("F-03: refuses local fenced code-analysis delivery on protected paths, secret content, or missing snapshotId and stamps CONTENT_POLICY_VERSION", async () => {
    const box = createSandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const hooksDir = join(box.root, "disabled-hooks");
    mkdirSync(hooksDir, { recursive: true });
    const declaration = createLiveDeclaration({
      tenant: "local:l9e-f03",
      principal: "local:l9e-f03-p",
      hostFingerprint: "l9e-f03-fp",
      identityUncertainty: [],
      declarationId: "decl:l9e:f03",
      cloneId: "clone:l9e:f03",
      worktreeId: "wt:l9e:f03",
      authorizedRoots: [corpus.repo],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
    });
    const nowRef = { now: 1_700_000_000_000 };
    const trace = trackTrace(new ProducerArtifactTrace({
      trace: box.trace,
      allowedHostDirs: [hooksDir],
      observedRoots: [corpus.root],
    }));
    const fake = makeFakePorts({ box, hooksDir, declaration, trace, nowRef });
    const distIntegration = (await import(
      pathToFileURL(join(liveRoot, "dist", "integration.js")).href
    )) as typeof import("../engram-live/integration.js");
    const factory = distIntegration.createLiveFactory({ declaration, ports: fake.ports });
    activeFactories.push(factory);
    const wtToken: ScopeFencingTokenDto = {
      tokenId: "tok:wt:f03:1",
      scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
      declarationRevision: declaration.declarationRevision,
      epoch: 1,
      epochId: "epoch:1",
      projectionIncarnation: fake.incarnation,
      issuedAt: nowRef.now - 1_000,
      expiresAt: nowRef.now + 600_000,
    };
    const noopObjects = { async loadBlob() { return null; }, async loadObject() { return null; } };
    const validSnapId = "lsnap:" + "c".repeat(64);
    try {
      // 1. Protected path (.env) + secret content must fail closed to unavailable with 0 sink writes.
      const envRes = await factory.runCapability("code-analysis", {
        input: {
          scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
          language: "typescript",
          path: ".env",
          content: 'export const SECRET = "sk-ant-api03-red-probe-value";\n',
          treeOid: null,
          snapshotId: validSnapId,
          worktreeId: declaration.worktreeId,
          configHash: fixture.base.configHash,
          dependencyHash: fixture.base.dependencyHash,
          historicalBounds: null,
        },
        objects: noopObjects,
        generationId: formatProducerGenerationId(1),
        fencingToken: wtToken,
      });
      expect(envRes).toMatchObject({ capability: "code-analysis", state: "unavailable", delivered: false });

      // 2. Clean path with secret text content must fail closed to unavailable.
      const secretRes = await factory.runCapability("code-analysis", {
        input: {
          scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
          language: "typescript",
          path: "src/config.ts",
          content: 'export const api_key = "AKIAIOSFODNN7EXAMPLE9";\n',
          treeOid: null,
          snapshotId: validSnapId,
          worktreeId: declaration.worktreeId,
          configHash: fixture.base.configHash,
          dependencyHash: fixture.base.dependencyHash,
          historicalBounds: null,
        },
        objects: noopObjects,
        generationId: formatProducerGenerationId(2),
        fencingToken: wtToken,
      });
      expect(secretRes).toMatchObject({ capability: "code-analysis", state: "unavailable", delivered: false });

      // 3. Missing/non-strict snapshotId on local delivery must fail closed.
      const noSnapRes = await factory.runCapability("code-analysis", {
        input: {
          scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
          language: "typescript",
          path: "src/clean.ts",
          content: "export const cleanVal = 1;\n",
          treeOid: null,
          snapshotId: null,
          worktreeId: declaration.worktreeId,
          configHash: fixture.base.configHash,
          dependencyHash: fixture.base.dependencyHash,
          historicalBounds: null,
        },
        objects: noopObjects,
        generationId: formatProducerGenerationId(3),
        fencingToken: wtToken,
      });
      expect(noSnapRes).toMatchObject({ capability: "code-analysis", state: "unavailable", delivered: false });

      // 3b. R2-01: Secret text in input.language on local delivery must fail closed without sink writes.
      const secretLangRes = await factory.runCapability("code-analysis", {
        input: {
          scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
          language: "password=supersecret-leak-999",
          path: "src/clean.ts",
          content: "export const cleanVal = 1;\n",
          treeOid: null,
          snapshotId: validSnapId,
          worktreeId: declaration.worktreeId,
          configHash: fixture.base.configHash,
          dependencyHash: fixture.base.dependencyHash,
          historicalBounds: null,
        },
        objects: noopObjects,
        generationId: formatProducerGenerationId(30),
        fencingToken: wtToken,
      });
      expect(secretLangRes).toMatchObject({ capability: "code-analysis", state: "unavailable", delivered: false });
      expect(fake.deliveredBatches).toHaveLength(0);

      // 4. Valid local delivery succeeds and stamps CONTENT_POLICY_VERSION on both batch and code-analysis fact.
      const cleanRes = await factory.runCapability("code-analysis", {
        input: {
          scope: { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId },
          language: "typescript",
          path: "src/clean.ts",
          content: "export function cleanFn() { return 1; }\n",
          treeOid: null,
          snapshotId: validSnapId,
          worktreeId: declaration.worktreeId,
          configHash: fixture.base.configHash,
          dependencyHash: fixture.base.dependencyHash,
          historicalBounds: null,
        },
        objects: noopObjects,
        generationId: formatProducerGenerationId(4),
        fencingToken: wtToken,
      });
      expect(cleanRes).toMatchObject({ capability: "code-analysis", state: "available", delivered: true });
      expect(fake.deliveredBatches).toHaveLength(1);
      const batch = fake.deliveredBatches[0]!.batch;
      expect(batch.policyVersion).toBe(CONTENT_POLICY_VERSION);
      const codeFact = batch.facts.find((f): f is CodeAnalysisFactDto => f.kind === "code-analysis");
      expect(codeFact?.policyVersion).toBe(CONTENT_POLICY_VERSION);

      // 5. R2-01: Sanitized coverage fallback message never echoes raw input.language when coverage.reason is withheld.
      const obj = makeCommittedRepoObjects("src/clean.ts", "export const cleanVal = 1;\n");
      const cloneToken: ScopeFencingTokenDto = {
        tokenId: "tok:clone:f03:1",
        scope: { tenant: declaration.tenant, clone: declaration.cloneId },
        declarationRevision: declaration.declarationRevision,
        epoch: 1,
        epochId: "epoch:1",
        projectionIncarnation: fake.incarnation,
        issuedAt: nowRef.now - 1_000,
        expiresAt: nowRef.now + 600_000,
      };
      const fallbackRes = await factory.runCapability("code-analysis", {
        input: {
          scope: { tenant: declaration.tenant, clone: declaration.cloneId },
          language: "password=supersecret-leak-999",
          path: "src/clean.ts",
          content: "export const cleanVal = 1;\n",
          treeOid: obj.tree.oid,
          configHash: fixture.base.configHash,
          dependencyHash: fixture.base.dependencyHash,
          historicalBounds: { known: true, heads: [obj.commit] },
        },
        objects: obj.objectsPort,
        generationId: formatProducerGenerationId(31),
        fencingToken: cloneToken,
      });
      expect(fallbackRes).toMatchObject({ capability: "code-analysis", state: "available", delivered: true });
      expect(fake.deliveredBatches).toHaveLength(2);
      const fallbackCoverage = fake.deliveredBatches[1]!.batch.facts.find(
        (f): f is CoverageFactDto => f.kind === "coverage",
      );
      expect(fallbackCoverage?.reason).toBe("code-analysis unavailable");
      expect(fallbackCoverage?.reason).not.toContain("supersecret-leak-999");
    } finally {
      await factory.disable({ reason: "owner-request", generationId: formatProducerGenerationId(5) }).catch(() => undefined);
    }
  }, 15_000);

  it("F-04: code-analysis delivery fails closed on oversized batch, invalid treeOid or pathBytes, caller token mutation, and pre-delivery disable or clock failure", async () => {
    const box = createSandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const hooksDir = join(box.root, "disabled-hooks");
    mkdirSync(hooksDir, { recursive: true });
    const declaration = createLiveDeclaration({
      tenant: "local:l9e-f04",
      principal: "local:l9e-f04-p",
      hostFingerprint: "l9e-f04-fp",
      identityUncertainty: [],
      declarationId: "decl:l9e:f04",
      cloneId: "clone:l9e:f04",
      worktreeId: "wt:l9e:f04",
      authorizedRoots: [corpus.repo],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
    });
    const nowRef = { now: 1_700_000_000_000 };
    const trace = trackTrace(new ProducerArtifactTrace({
      trace: box.trace,
      allowedHostDirs: [hooksDir],
      observedRoots: [corpus.root],
    }));
    const fake = makeFakePorts({ box, hooksDir, declaration, trace, nowRef });
    const distIntegration = (await import(
      pathToFileURL(join(liveRoot, "dist", "integration.js")).href
    )) as typeof import("../engram-live/integration.js");
    const factory = distIntegration.createLiveFactory({ declaration, ports: fake.ports });
    activeFactories.push(factory);
    const obj = makeCommittedRepoObjects(fixture.base.path, fixture.contents.v1);
    const makeCloneToken = (): ScopeFencingTokenDto => ({
      tokenId: "tok:clone:f04:1",
      scope: { tenant: declaration.tenant, clone: declaration.cloneId },
      declarationRevision: declaration.declarationRevision,
      epoch: 1,
      epochId: "epoch:1",
      projectionIncarnation: fake.incarnation,
      issuedAt: nowRef.now - 1_000,
      expiresAt: nowRef.now + 600_000,
    });
    try {
      // 0. R2-04: Non-string treeOid (e.g. single-element array) must fail closed in validateCodeDelivery before grammar probing.
      let fsReadsOnArrayTreeOid = 0;
      const origReadFileBytes = fake.ports.filesystem.readFileBytes;
      fake.ports.filesystem.readFileBytes = async (p: string) => {
        fsReadsOnArrayTreeOid += 1;
        return origReadFileBytes(p);
      };
      const arrayTreeRes = await factory.runCapability("code-analysis", {
        input: {
          scope: { tenant: declaration.tenant, clone: declaration.cloneId },
          language: fixture.base.language,
          path: fixture.base.path,
          content: fixture.contents.v1,
          treeOid: ["a".repeat(40)] as unknown as string,
          configHash: fixture.base.configHash,
          dependencyHash: fixture.base.dependencyHash,
          historicalBounds: { known: true, heads: [obj.commit] },
        },
        objects: obj.objectsPort,
        generationId: formatProducerGenerationId(30),
        fencingToken: makeCloneToken(),
      });
      fake.ports.filesystem.readFileBytes = origReadFileBytes;
      expect(arrayTreeRes).toMatchObject({
        capability: "code-analysis",
        state: "unavailable",
        delivered: false,
      });
      expect((arrayTreeRes as { reason?: string }).reason).toMatch(
        /treeOid must be null or a 40\/64-character lowercase hex OID/,
      );
      expect(fsReadsOnArrayTreeOid).toBe(0);

      // 1. Oversized batch (maxBatchBytes: 64) must return unavailable instead of throwing BatchCodecError.
      const tinyRes = await factory.runCapability("code-analysis", {
        input: {
          scope: { tenant: declaration.tenant, clone: declaration.cloneId },
          language: fixture.base.language,
          path: fixture.base.path,
          content: fixture.contents.v1,
          treeOid: obj.tree.oid,
          configHash: fixture.base.configHash,
          dependencyHash: fixture.base.dependencyHash,
          historicalBounds: { known: true, heads: [obj.commit] },
        },
        objects: obj.objectsPort,
        generationId: formatProducerGenerationId(1),
        fencingToken: makeCloneToken(),
        maxBatchBytes: 64,
      });
      expect(tinyRes).toMatchObject({ capability: "code-analysis", state: "unavailable", delivered: false });

      // 2. Undefined or invalid treeOid must return unavailable instead of throwing TypeError.
      const undefTreeRes = await factory.runCapability("code-analysis", {
        input: {
          scope: { tenant: declaration.tenant, clone: declaration.cloneId },
          language: fixture.base.language,
          path: fixture.base.path,
          content: fixture.contents.v1,
          treeOid: undefined as unknown as string,
          configHash: fixture.base.configHash,
          dependencyHash: fixture.base.dependencyHash,
          historicalBounds: { known: true, heads: [obj.commit] },
        },
        objects: obj.objectsPort,
        generationId: formatProducerGenerationId(2),
        fencingToken: makeCloneToken(),
      });
      expect(undefTreeRes).toMatchObject({ capability: "code-analysis", state: "unavailable", delivered: false });

      // 3. Invalid pathBytes must return unavailable instead of throwing.
      const badPathBytesRes = await factory.runCapability("code-analysis", {
        input: {
          scope: { tenant: declaration.tenant, clone: declaration.cloneId },
          language: fixture.base.language,
          path: fixture.base.path,
          content: fixture.contents.v1,
          treeOid: obj.tree.oid,
          configHash: fixture.base.configHash,
          dependencyHash: fixture.base.dependencyHash,
          historicalBounds: { known: true, heads: [obj.commit] },
        },
        objects: obj.objectsPort,
        generationId: formatProducerGenerationId(3),
        fencingToken: makeCloneToken(),
        pathBytes: 123 as unknown as Uint8Array,
      });
      expect(badPathBytesRes).toMatchObject({ capability: "code-analysis", state: "unavailable", delivered: false });

      // 4. Caller mutating fencingToken asynchronously cannot corrupt cloned token; invalid clock before deliver fails closed.
      const mutableToken = makeCloneToken() as {
        tokenId: string;
        scope: { tenant: string; clone: string };
        declarationRevision: number;
        epoch: number;
        epochId: string;
        projectionIncarnation: string;
        issuedAt: number;
        expiresAt: number;
      };
      let firstObjRead = true;
      const mutatingObjects = {
        async loadBlob(oid: string) {
          if (firstObjRead) {
            firstObjRead = false;
            mutableToken.declarationRevision = 999;
            mutableToken.expiresAt = 1;
          }
          return obj.objectsPort.loadBlob(oid);
        },
        async loadObject(oid: string) {
          if (firstObjRead) {
            firstObjRead = false;
            mutableToken.declarationRevision = 999;
            mutableToken.expiresAt = 1;
          }
          return obj.objectsPort.loadObject(oid);
        },
      };
      const clonedRes = await factory.runCapability("code-analysis", {
        input: {
          scope: { tenant: declaration.tenant, clone: declaration.cloneId },
          language: fixture.base.language,
          path: fixture.base.path,
          content: fixture.contents.v1,
          treeOid: obj.tree.oid,
          configHash: fixture.base.configHash,
          dependencyHash: fixture.base.dependencyHash,
          historicalBounds: { known: true, heads: [obj.commit] },
        },
        objects: mutatingObjects,
        generationId: formatProducerGenerationId(4),
        fencingToken: mutableToken,
      });
      expect(clonedRes).toMatchObject({ capability: "code-analysis", state: "available", delivered: true });
      expect(fake.deliveredBatches[0]!.token.declarationRevision).toBe(declaration.declarationRevision);

      // 5. Clock becoming invalid immediately before sink delivery must fail closed without calling sink.
      let sinkCallsBefore = fake.deliveredBatches.length;
      const origNow = fake.ports.clock.now;
      let clockCalls = 0;
      fake.ports.clock.now = () => {
        clockCalls += 1;
        return clockCalls >= 3 ? -1 : origNow();
      };
      const badClockRes = await factory.runCapability("code-analysis", {
        input: {
          scope: { tenant: declaration.tenant, clone: declaration.cloneId },
          language: fixture.base.language,
          path: fixture.base.path,
          content: fixture.contents.v1,
          treeOid: obj.tree.oid,
          configHash: fixture.base.configHash,
          dependencyHash: fixture.base.dependencyHash,
          historicalBounds: { known: true, heads: [obj.commit] },
        },
        objects: obj.objectsPort,
        generationId: formatProducerGenerationId(5),
        fencingToken: makeCloneToken(),
      });
      fake.ports.clock.now = origNow;
      expect(badClockRes).toMatchObject({ capability: "code-analysis", state: "unavailable", delivered: false });
      expect(fake.deliveredBatches).toHaveLength(sinkCallsBefore);
    } finally {
      await factory.disable({ reason: "owner-request", generationId: formatProducerGenerationId(6) }).catch(() => undefined);
    }
  }, 15_000);

  it("F-05: disable latches immediately against concurrent capabilities, refuses loadGrammar afterwards, and throws when scheduled shutdown fails", async () => {
    const box = createSandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const hooksDir = join(box.root, "disabled-hooks");
    mkdirSync(hooksDir, { recursive: true });
    const declaration = createLiveDeclaration({
      tenant: "local:l9e-f05",
      principal: "local:l9e-f05-p",
      hostFingerprint: "l9e-f05-fp",
      identityUncertainty: [],
      declarationId: "decl:l9e:f05",
      cloneId: "clone:l9e:f05",
      worktreeId: "wt:l9e:f05",
      authorizedRoots: [corpus.repo],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
    });
    const nowRef = { now: 1_700_000_000_000 };
    const trace = trackTrace(new ProducerArtifactTrace({
      trace: box.trace,
      allowedHostDirs: [hooksDir],
      observedRoots: [corpus.root],
    }));
    const distIntegration = (await import(
      pathToFileURL(join(liveRoot, "dist", "integration.js")).href
    )) as typeof import("../engram-live/integration.js");

    // 1. Failed scheduled shutdown (invalid generationId OR incomplete scheduling ports) must reject instead of returning { disabled: true, shutdownCompleted: false }.
    const fake1 = makeFakePorts({ box, hooksDir, declaration, trace, nowRef });
    const factory1 = distIntegration.createLiveFactory({ declaration, ports: fake1.ports });
    activeFactories.push(factory1);
    await expect(factory1.disable({ generationId: "invalid-gen" })).rejects.toThrow();

    const fakeIncomplete = makeFakePorts({ box, hooksDir, declaration, trace, nowRef });
    const incompletePorts = {
      ...fakeIncomplete.ports,
      clock: { now: fakeIncomplete.ports.clock.now },
    };
    const factoryIncomplete = distIntegration.createLiveFactory({ declaration, ports: incompletePorts });
    activeFactories.push(factoryIncomplete);
    await expect(factoryIncomplete.disable({ generationId: formatProducerGenerationId(1) })).rejects.toThrow(/shutdown failed/i);

    // 2. Concurrent runCapability and loadGrammar while disable() is awaiting purgePrivate must immediately fail closed,
    //    and loadGrammar after disable() must return unavailable.
    const fake2 = makeFakePorts({ box, hooksDir, declaration, trace, nowRef });
    let releasePurge!: () => void;
    let purgeEntered!: () => void;
    const purgeEnteredPromise = new Promise<void>((r) => { purgeEntered = r; });
    const purgeGate = new Promise<void>((r) => { releasePurge = r; });
    const origPurge = fake2.ports.content.latestSnapshots.purgePrivate;
    fake2.ports.content.latestSnapshots.purgePrivate = async (q) => {
      purgeEntered();
      await purgeGate;
      return origPurge(q);
    };
    const factory2 = distIntegration.createLiveFactory({ declaration, ports: fake2.ports });
    const obj = makeCommittedRepoObjects(fixture.base.path, fixture.contents.v1);
    const cloneToken: ScopeFencingTokenDto = {
      tokenId: "tok:clone:f05:1",
      scope: { tenant: declaration.tenant, clone: declaration.cloneId },
      declarationRevision: declaration.declarationRevision,
      epoch: 1,
      epochId: "epoch:1",
      projectionIncarnation: fake2.incarnation,
      issuedAt: nowRef.now - 1_000,
      expiresAt: nowRef.now + 600_000,
    };

    const disPromise = factory2.disable({ reason: "policy-withdrawn", generationId: formatProducerGenerationId(10) });
    await purgeEnteredPromise;
    const duringDisable = await factory2.runCapability("code-analysis", {
      input: {
        scope: { tenant: declaration.tenant, clone: declaration.cloneId },
        language: fixture.base.language,
        path: fixture.base.path,
        content: fixture.contents.v1,
        treeOid: obj.tree.oid,
        configHash: fixture.base.configHash,
        dependencyHash: fixture.base.dependencyHash,
        historicalBounds: { known: true, heads: [obj.commit] },
      },
      objects: obj.objectsPort,
      generationId: formatProducerGenerationId(11),
      fencingToken: cloneToken,
    });
    const grammarDuringDisable = await factory2.loadGrammar("typescript");
    releasePurge();
    const disRes = await disPromise;
    expect(disRes.disabled).toBe(true);
    expect(duringDisable).toMatchObject({ capability: "code-analysis", state: "unavailable", delivered: false });
    expect(grammarDuringDisable).toMatchObject({ language: "typescript", state: "unavailable" });
    expect(fake2.deliveredBatches).toHaveLength(0);

    const grammarAfterDisable = await factory2.loadGrammar("typescript");
    expect(grammarAfterDisable).toMatchObject({ language: "typescript", state: "unavailable" });
  }, 15_000);
});
