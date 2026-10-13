// L4b — Content policy and encrypted latest local content, siège engram (PARTIE E: UNIQUEMENT)
// (plan/09 L4b ; spec/SPEC_LIVE_GIT_INDEXING.md §§8, 10, A09).
//
// Test-first : ce fichier est écrit avant engram-live/content-policy.ts,
// engram-live/snapshots.ts et avant les DTOs L4b de contracts.ts ; il doit
// être observé ROUGE. Faux ports uniquement (protection de contenu,
// fournisseur de clés, magasin de dernier état, puits de faits) : aucune
// base, aucun import h2a/cluster-mesh/sentropic, aucun réseau.
// Décision owner Q2 B : politique secret/chemin déterministe AVANT toute
// persistance (jamais persister puis masquer) ; sans clé de protection →
// métadonnées autorisées seulement + demande de purge au désenregistrement ;
// .gitignore n'est jamais une garantie de secret. Secrets SYNTHÉTIQUES
// uniquement (tests/fixtures/live-private-content.json).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTENT_POLICY_VERSION,
  CONTENT_UNAVAILABLE,
  CONTRACT_VERSION,
  GENERATION_ID_WIDTH,
  LOCAL_DIFF_NORMALIZER_VERSION,
  isStrictGenerationId,
  validateFactBatch,
  validateLocalDiff,
  validateLocalSnapshot,
  validateSealedLocalDiff,
  type DeclarationRevocationDto,
  type FactBatchDto,
  type LiveScope,
  type LocalDiffDto,
  type LocalSnapshotDto,
} from "../engram-live/contracts.js";
import {
  SECRET_PATTERNS,
  classifyPath,
  containsSecretText,
  scanValuesForLeak,
  screenBatchSurfaces,
  type KeyProviderPort,
  type ScreenedSurfaces,
} from "../engram-live/content-policy.js";
import {
  deriveLocalDiff,
} from "../engram-live/diffs.js";
import {
  SNAPSHOT_ERROR_CODES,
  SnapshotError,
  runUnregisterPurge,
  stageLocalSnapshot,
  type ContentProtectionPort,
  type FactSinkPort,
  type FactSinkReceipt,
  type LatestSnapshotPort,
  type LatestSnapshotQuery,
  type LatestSnapshotScope,
  type PurgePrivateReceipt,
  type ReplaceLatestReceipt,
  type SealedPayload,
} from "../engram-live/snapshots.js";

const SCOPE: LiveScope = { tenant: "local:test-owner", clone: "clone:l4b-policy" };
const WORKTREE_ID = "wt:l4b-policy-main";

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);

const entryLike = (path: string, oid: string) => ({
  path: enc(path),
  mode: "100644",
  oid,
  stage: 0,
  kind: "file" as const,
  size: 120,
  isBinary: false,
});

interface FixtureSecretText {
  readonly id: string;
  readonly kind: string;
  readonly value: string;
}
interface FixtureSecretPath {
  readonly id: string;
  readonly path: string;
  readonly kind: string;
}
function loadFixture(): { texts: FixtureSecretText[]; paths: FixtureSecretPath[]; gitignoreDecoy: string } {
  const raw = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures", "live-private-content.json"),
    "utf8",
  );
  const parsed = JSON.parse(raw) as {
    secretTexts: FixtureSecretText[];
    secretPaths: FixtureSecretPath[];
    gitignoreDecoy: string;
  };
  expect(parsed.secretTexts.length).toBeGreaterThan(0);
  return { texts: parsed.secretTexts, paths: parsed.secretPaths, gitignoreDecoy: parsed.gitignoreDecoy };
}

/** Faux port de protection : scellé déterministe, appels enregistrés. */
class FakeProtectionPort implements ContentProtectionPort {
  readonly protectCalls: Uint8Array[] = [];
  async protect(plaintext: Uint8Array): Promise<SealedPayload> {
    this.protectCalls.push(plaintext);
    return {
      state: "sealed",
      algorithm: "fake-seal/1",
      keyRef: "fake-keyref-1",
      ciphertext: enc(`sealed:${plaintext.length}`),
    };
  }
}

/** Faux fournisseur de clés indisponible (siège H implémentera le réel). */
class MissingKeyProvider implements KeyProviderPort {
  async currentKeyRef(): Promise<{ state: "unavailable"; reason: string }> {
    return { state: "unavailable", reason: "no protection key is registered for this scope" };
  }
}

/** Faux magasin "dernier état uniquement" (S implémentera le durable réel). */
class FakeLatestStore implements LatestSnapshotPort {
  readonly stored: LocalSnapshotDto[] = [];
  readonly deleted: string[] = [];
  readonly purgeQueries: unknown[] = [];
  private readonly knownGenerations = new Set<string>();
  private readonly blockedGenerations = new Set<string>();
  /** Une tenue par cible complète (scope, worktreeId, kind, diffKind) — staged, unstaged et conflit ne partagent jamais de tenue. */
  private readonly latest = new Map<string, LocalSnapshotDto>();
  private targetOf(value: {
    readonly scope: LiveScope;
    readonly worktreeId: string;
    readonly kind: string;
    readonly diffKind: string;
  }): string {
    return [
      value.scope.tenant,
      value.scope.clone,
      value.scope.worktree ?? "",
      value.worktreeId,
      value.kind,
      value.diffKind,
    ].join("|");
  }
  purged = 0;
  async loadLatest(query: LatestSnapshotQuery): Promise<LocalSnapshotDto | null> {
    if (this.blockedGenerations.has(query.generationId)) {
      throw new Error("stale generation blocked after purge");
    }
    this.knownGenerations.add(query.generationId);
    return this.latest.get(this.targetOf(query)) ?? null;
  }
  async replaceLatest(
    snapshot: LocalSnapshotDto,
    expectedSupersededId: string | null,
    generationId: string,
  ): Promise<ReplaceLatestReceipt> {
    if (this.blockedGenerations.has(generationId)) {
      throw new Error("stale generation blocked after purge");
    }
    const key = this.targetOf(snapshot);
    const current = this.latest.get(key) ?? null;
    if ((current?.snapshotId ?? null) !== expectedSupersededId) {
      throw new Error("latest replacement conflict: expected predecessor is no longer latest");
    }
    const replaced = current !== null && current.snapshotId !== snapshot.snapshotId;
    if (replaced) {
      this.deleted.push(current.snapshotId);
      const at = this.stored.findIndex((held) => held.snapshotId === current.snapshotId);
      if (at >= 0) this.stored.splice(at, 1);
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
  async purgePrivate(query: LatestSnapshotScope): Promise<PurgePrivateReceipt> {
    this.purged += 1;
    this.purgeQueries.push(query);
    for (const generation of this.knownGenerations) this.blockedGenerations.add(generation);
    this.knownGenerations.clear();
    return { purgedPrivate: true, blockedOldWork: true, revokedDecryptability: true };
  }
}

/** Faux puits de faits : enregistre chaque lot livré. */
class FakeSink implements FactSinkPort {
  readonly batches: FactBatchDto[] = [];
  async deliver(batch: FactBatchDto): Promise<FactSinkReceipt> {
    this.batches.push(batch);
    return {
      received: true,
      batchId: batch.batchId,
      retiredSuperseded: true,
      revokedDecryptability: true,
    };
  }
}

function collectStrings(value: unknown): string[] {
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (typeof node === "string") out.push(node);
    else if (node instanceof Uint8Array) out.push(new TextDecoder().decode(node));
    else if (Array.isArray(node)) for (const item of node) visit(item);
    else if (node !== null && typeof node === "object") {
      for (const item of Object.values(node as Record<string, unknown>)) visit(item);
    }
  };
  visit(value);
  return out;
}

describe("live content policy", () => {
  it("emitted batches fake sink calls and producer diagnostics contain no forbidden plaintext or derivatives", async () => {
    const { texts, paths, gitignoreDecoy } = loadFixture();
    expect(gitignoreDecoy).toContain("!.env");
    const secretValues = texts.map((t) => t.value);

    // Chaque valeur secrète est reconnue par la politique déterministe.
    for (const secret of secretValues) {
      expect(containsSecretText(secret)).toBe(true);
    }

    // La politique s'applique à toutes les surfaces, pas seulement au patch.
    const surfaces: ScreenedSurfaces = screenBatchSurfaces({
      patchText: secretValues.join("\n"),
      symbolNames: ["add", texts[0]!.value],
      citationQuotes: [texts[1]!.value],
      searchSnippets: [`see ${texts[2]!.value} for details`],
      contextExcerpts: [texts[3]!.value],
    });
    expect(surfaces.patchText).toBeNull();
    expect(surfaces.symbolNames).toEqual(["add"]);
    expect(surfaces.citationQuotes).toEqual([]);
    expect(surfaces.searchSnippets).toEqual([]);
    expect(surfaces.contextExcerpts).toEqual([]);
    expect(surfaces.policyVersion).toBe(CONTENT_POLICY_VERSION);

    // .gitignore ne garantit jamais le secret : la négation "!.env" du
    // leurre ne débloque pas le chemin protégé (aucune entrée gitignore
    // n'existe dans l'API de la politique, par construction).
    const diff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: paths
        .filter((p) => p.kind === "protected-path")
        .map((p) => ({
          path: enc(p.path),
          mode: "100644",
          oid: "0".repeat(40),
          stage: 0,
          kind: "file" as const,
          size: 64,
          isBinary: false,
        })),
    });
    for (const file of diff.files) {
      expect(file.exclusion).toBe("protected");
    }
    expect(validateLocalDiff(diff).ok).toBe(true);

    // Politique AVANT tout stockage (L4b-2 MAJEUR 1) : la charge utile
    // porte des secrets détectés — aucun appel protect, métadonnées
    // seulement avec couverture indisponible explicite. Le magasin et le
    // puits ne voient que des refus explicites, jamais le clair.
    const protection = new FakeProtectionPort();
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const staged = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_000_000_000,
      diff,
      plaintextPayload: enc(secretValues.join("\n")),
      protection,
      store,
      sink,
      batchId: "batch:l4b-policy-1",
      generationId: "gen:0000000001",
    });
    expect(staged.snapshot.sealed).toEqual({
      state: "metadata-only",
      reason: "metadata:policy-withheld",
    });
    expect(staged.coverage.state).toBe("unavailable");
    expect(staged.coverage.cause).toBe("policy-withheld");
    expect(validateLocalSnapshot(staged.snapshot).ok).toBe(true);
    expect(protection.protectCalls).toEqual([]);

    // Q2 B : le remplacement ne garde que le dernier état autorisé —
    // le précédent est désigné remplacé puis supprimé, sans historique.
    const second = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_000_001_000,
      diff,
      plaintextPayload: enc("public follow-up state"),
      protection,
      store,
      sink,
      batchId: "batch:l4b-policy-1b",
      generationId: "gen:0000000002",
    });
    expect(second.batch.generationId > staged.batch.generationId).toBe(true);
    expect(second.snapshot.sealed.state).toBe("sealed");
    expect(protection.protectCalls).toHaveLength(1);
    expect(store.deleted).toEqual([staged.snapshot.snapshotId]);
    expect(store.stored.map((s) => s.snapshotId)).toEqual([second.snapshot.snapshotId]);

    const leaked = scanValuesForLeak(
      [...collectStrings(store.stored), ...collectStrings(sink.batches)],
      secretValues,
    );
    expect(leaked).toEqual([]);
    // Les diagnostics producteurs ne portent aucun dérivé du secret.
    const diagnostics = collectStrings(staged.diagnostics);
    expect(scanValuesForLeak(diagnostics, secretValues)).toEqual([]);
  });

  it("absent fake protection keys emit allowed metadata only and unregister requests private payload purge", async () => {
    const { texts } = loadFixture();
    const secretValues = texts.map((t) => t.value);

    const keys: KeyProviderPort = new MissingKeyProvider();
    const keyState = await keys.currentKeyRef();
    expect(keyState.state).toBe("unavailable");

    const diff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: { label: "HEAD", oid: "a".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      baseEntries: [],
      tipEntries: [
        {
          path: enc("src/app.ts"),
          mode: "100644",
          oid: "d".repeat(40),
          stage: 0,
          kind: "file",
          size: 120,
          isBinary: false,
        },
      ],
    });

    // Secret détecté, avec ou sans clé (L4b-2 MAJEUR 1) : la politique
    // prime — métadonnées policy-withheld, aucun appel protect, couverture
    // content_unavailable explicite.
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const staged = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "index",
      capturedAt: 1_700_000_000_000,
      diff,
      plaintextPayload: enc(secretValues.join("\n")),
      protection: null,
      store,
      sink,
      batchId: "batch:l4b-policy-2",
      generationId: "gen:0000000003",
    });
    expect(staged.snapshot.sealed).toEqual({
      state: "metadata-only",
      reason: "metadata:policy-withheld",
    });
    expect(staged.coverage.state).toBe("unavailable");
    expect(staged.coverage.cause).toBe("policy-withheld");
    expect(staged.coverage.reason).toContain(CONTENT_UNAVAILABLE);
    expect(validateLocalSnapshot(staged.snapshot).ok).toBe(true);
    const leaked = scanValuesForLeak(
      [...collectStrings(store.stored), ...collectStrings(sink.batches)],
      secretValues,
    );
    expect(leaked).toEqual([]);

    // Au désenregistrement : arrêt, rejet des différés, purge du privé,
    // historique commis préservé (aucune suppression du commis n'existe).
    const revocation: DeclarationRevocationDto = {
      declarationId: "decl:l4b-policy-1",
      tenant: SCOPE.tenant,
      cloneId: SCOPE.clone,
      worktreeId: WORKTREE_ID,
      declarationRevision: 1,
      reason: "workspace-remove",
      requestPrivatePurge: {
        purgePrivateSnapshots: true,
        purgeDerivedIndexes: true,
        revokeDecryptability: true,
        preserveCommittedHistory: true,
      },
    };
    const purged = await runUnregisterPurge({ revocation, store });
    expect(purged.stoppedWork).toBe(true);
    expect(purged.rejectedDelayedJobs).toBe(true);
    expect(purged.purgedPrivate).toBe(true);
    expect(purged.preservedCommittedHistory).toBe(true);
    expect(store.purged).toBe(1);
    expect(store.purgeQueries).toEqual([
      {
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        declarationId: "decl:l4b-policy-1",
        declarationRevision: 1,
      },
    ]);
  });

  it("minor M6: without a key, open hunks degrade to metadata with bounds kept", async () => {
    const diff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: { label: "HEAD", oid: "a".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      baseEntries: [entryLike("src/app.ts", "c".repeat(40))],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
      hunkDrafts: [
        {
          path: enc("src/app.ts"),
          startBefore: 2,
          countBefore: 1,
          startAfter: 2,
          countAfter: 1,
          lines: ["+allowed line without key"],
        },
      ],
    });
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const staged = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "index",
      capturedAt: 1_700_000_010_000,
      diff,
      plaintextPayload: enc("dropped without a key"),
      protection: null,
      store,
      sink,
      batchId: "batch:l4b-minor-m6",
      generationId: "gen:0000000004",
    });
    expect(staged.snapshot.sealed).toEqual({
      state: "metadata-only",
      reason: "metadata:no-key",
    });
    expect(staged.coverage.state).toBe("unavailable");
    expect(staged.coverage.reason).toContain(CONTENT_UNAVAILABLE);
    const facts = sink.batches[0]?.facts as unknown[];
    const kept = JSON.stringify(facts);
    expect(kept).toContain("withheld");
    expect(kept).toContain("startBefore");
    expect(validateLocalSnapshot(staged.snapshot).ok).toBe(true);
  });

  it("minor M7: a capture suspended across the purge can never persist", async () => {
    let releaseProtect!: (value: SealedPayload) => void;
    const gate = new Promise<SealedPayload>((resolve) => {
      releaseProtect = resolve;
    });
    const suspendedProtection: ContentProtectionPort = {
      protect: (plaintext: Uint8Array): Promise<SealedPayload> => {
        void plaintext;
        return gate;
      },
    };
    const diff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    });
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const attempt = stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_000_020_000,
      diff,
      plaintextPayload: enc("public suspended state"),
      protection: suspendedProtection,
      store,
      sink,
      batchId: "batch:l4b-minor-m7",
      generationId: "gen:0000000005",
    });
    const revocation: DeclarationRevocationDto = {
      declarationId: "decl:l4b-minor-m7",
      tenant: SCOPE.tenant,
      cloneId: SCOPE.clone,
      worktreeId: WORKTREE_ID,
      declarationRevision: 1,
      reason: "workspace-remove",
      requestPrivatePurge: {
        purgePrivateSnapshots: true,
        purgeDerivedIndexes: true,
        revokeDecryptability: true,
        preserveCommittedHistory: true,
      },
    };
    const purged = await runUnregisterPurge({ revocation, store });
    expect(purged.purgedPrivate).toBe(true);
    releaseProtect({
      state: "sealed",
      algorithm: "fake-seal/1",
      keyRef: "fake-keyref-1",
      ciphertext: enc("sealed:22"),
    });
    await expect(attempt).rejects.toThrow();
    expect(sink.batches).toEqual([]);
    expect(store.stored).toEqual([]);
  });

  it("minor M8: a snapshot never changes the scope or kind of its diff", async () => {
    const foreign: LocalDiffDto = deriveLocalDiff({
      scope: { tenant: "local:another-tenant", clone: "clone:l4b-policy" },
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    });
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const protection = new FakeProtectionPort();
    await expect(stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_000_030_000,
      diff: foreign,
      plaintextPayload: enc("public"),
      protection,
      store,
      sink,
      batchId: "batch:l4b-minor-m8a",
      generationId: "gen:0000000006",
    })).rejects.toThrow();
    const staged: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: { label: "HEAD", oid: "a".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    });
    await expect(stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_000_031_000,
      diff: staged,
      plaintextPayload: enc("public"),
      protection,
      store,
      sink,
      batchId: "batch:l4b-minor-m8b",
      generationId: "gen:0000000006",
    })).rejects.toThrow();
    expect(sink.batches).toEqual([]);
  });

  it("review M1: sink-bound validators refuse clair smuggled under a sealed state", () => {
    const smuggled = "ghp_syntheticM1sealednotreal000001";
    expect(containsSecretText(smuggled)).toBe(true);
    const smuggledDiff = {
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: { label: "HEAD", oid: "a".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      normalizerVersion: LOCAL_DIFF_NORMALIZER_VERSION,
      policyVersion: CONTENT_POLICY_VERSION,
      files: [
        {
          path: enc("src/app.ts"),
          previousPath: null,
          status: "modified",
          oldMode: "100644",
          newMode: "100644",
          oldOid: "c".repeat(40),
          newOid: "d".repeat(40),
          added: null,
          deleted: null,
          hunks: [
            {
              startBefore: 1,
              countBefore: 1,
              startAfter: 1,
              countAfter: 1,
              payload: {
                state: "sealed",
                algorithm: "fake-seal/1",
                keyRef: "fake-keyref-1",
                ciphertext: enc("sealed:16"),
                lines: [smuggled],
              },
            },
          ],
        },
      ],
    };
    expect(validateSealedLocalDiff(smuggledDiff).ok).toBe(false);
    const batch = {
      scope: SCOPE,
      producerName: "engram-live",
      contractVersion: CONTRACT_VERSION,
      policyVersion: CONTENT_POLICY_VERSION,
      generationId: "gen:0000000007",
      batchId: "batch:l4b-review-m1",
      batchDigest: "0".repeat(64),
      facts: [smuggledDiff],
    };
    expect(validateFactBatch(batch).ok).toBe(false);
  });

  it("review M2: secret-bearing paths and diagnostics never carry clair", () => {
    const token = "ghp_syntheticM2pathnotreal00000002";
    expect(containsSecretText(token)).toBe(true);
    const diff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [
        {
          path: enc(`src/${token}.ts`),
          mode: "100644",
          oid: "d".repeat(40),
          stage: 0,
          kind: "file",
          size: 64,
          isBinary: false,
        },
      ],
    });
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]?.exclusion).toBe("protected");
    expect(scanValuesForLeak(collectStrings(diff.files), [token])).toEqual([]);

    const classification = classifyPath(`.env.${token}`);
    expect(classification.allowed).toBe(false);
    expect(scanValuesForLeak([classification.reason], [token])).toEqual([]);

    const unstable = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [],
      stable: false,
      unstableReason: `rotation of ${token} during capture`,
    });
    expect(scanValuesForLeak(collectStrings(unstable), [token])).toEqual([]);

    const keyed = {
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      normalizerVersion: LOCAL_DIFF_NORMALIZER_VERSION,
      policyVersion: CONTENT_POLICY_VERSION,
      files: [
        {
          path: enc("src/clash.ts"),
          previousPath: null,
          status: "conflict",
          oldMode: "100644",
          newMode: "100644",
          oldOid: "1".repeat(40),
          newOid: "2".repeat(40),
          added: null,
          deleted: null,
          stageOids: { [token]: "3".repeat(40) },
          hunks: [],
        },
      ],
    };
    const keyedChecked = validateLocalDiff(keyed);
    expect(keyedChecked.ok).toBe(false);
    expect(scanValuesForLeak(keyedChecked.errors, [token])).toEqual([]);
  });

  it("review M3: a refused withdrawal never leaves two local states behind", async () => {
    class RefusingStore extends FakeLatestStore {
      override async replaceLatest(
        snapshot: LocalSnapshotDto,
        expectedSupersededId: string | null,
        generationId: string,
      ): Promise<ReplaceLatestReceipt> {
        if (this.stored.length === 0) {
          return super.replaceLatest(snapshot, expectedSupersededId, generationId);
        }
        throw new Error("latest replacement conflict: expected predecessor is no longer latest");
      }
    }
    const diff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [
        {
          path: enc("src/app.ts"),
          mode: "100644",
          oid: "d".repeat(40),
          stage: 0,
          kind: "file",
          size: 120,
          isBinary: false,
        },
      ],
    });
    const protection = new FakeProtectionPort();
    const store = new RefusingStore();
    const sink = new FakeSink();
    const first = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_000_000_000,
      diff,
      plaintextPayload: enc("public first state"),
      protection,
      store,
      sink,
      batchId: "batch:l4b-review-m3a",
      generationId: "gen:0000000013",
    });
    expect(first.snapshot.snapshotId).toMatch(/^lsnap:/);
    await expect(stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_000_001_000,
      diff,
      plaintextPayload: enc("public second state"),
      protection,
      store,
      sink,
      batchId: "batch:l4b-review-m3b",
      generationId: "gen:0000000014",
    })).rejects.toThrow();
    expect(store.stored).toHaveLength(1);
    expect(store.stored.map((s) => s.snapshotId)).toEqual([first.snapshot.snapshotId]);
    expect(sink.batches.map((b) => b.batchId)).toEqual(["batch:l4b-review-m3a"]);
  });

  it("review M4: the batch keeps sealed hunks bounds and exclusions, unstable never replaces valid", async () => {
    const diff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: { label: "HEAD", oid: "a".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      baseEntries: [],
      tipEntries: [
        {
          path: enc("src/app.ts"),
          mode: "100644",
          oid: "d".repeat(40),
          stage: 0,
          kind: "file",
          size: 120,
          isBinary: false,
        },
        {
          path: enc("assets/logo.png"),
          mode: "100644",
          oid: "e".repeat(40),
          stage: 0,
          kind: "file",
          size: 2048,
          isBinary: true,
        },
      ],
      hunkDrafts: [
        {
          path: enc("src/app.ts"),
          startBefore: 4,
          countBefore: 2,
          startAfter: 4,
          countAfter: 3,
          lines: [" context", "+allowed line"],
        },
      ],
    });
    const protection = new FakeProtectionPort();
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const first = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "index",
      capturedAt: 1_700_000_000_000,
      diff,
      plaintextPayload: null,
      protection,
      store,
      sink,
      batchId: "batch:l4b-review-m4a",
      generationId: "gen:0000000015",
    });
    const batchJson = JSON.stringify(sink.batches[0]);
    expect(batchJson).toContain("sealed");
    expect(batchJson).toContain("startBefore");
    expect(batchJson).toContain("binary");
    expect(first.coverage.state).not.toBe("current");

    const unstable = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: { label: "HEAD", oid: "a".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      baseEntries: [],
      tipEntries: [],
      stable: false,
      unstableReason: "capture loop raced an index rewrite",
    });
    const second = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "index",
      capturedAt: 1_700_000_002_000,
      diff: unstable,
      plaintextPayload: enc("public unstable attempt"),
      protection,
      store,
      sink,
      batchId: "batch:l4b-review-m4b",
      generationId: "gen:0000000016",
    });
    expect(second.coverage.state).not.toBe("current");
    expect(second.coverage.cause).toBe("unstable-capture");
    expect(store.stored.map((s) => s.snapshotId)).toEqual([first.snapshot.snapshotId]);
  });

  it("structural M2: boundary errors carry codes only, never input or port text", async () => {
    const token = "AKIAIOSFODNN7SYNTHETIC";
    const { validateLiveScope } = await import("../engram-live/contracts.js");
    const scoped = validateLiveScope({ tenant: "local:test-owner", clone: "clone:l4b-policy", [token]: "x" });
    expect(scoped.ok).toBe(false);
    expect(scanValuesForLeak(collectStrings(scoped.errors), [token])).toEqual([]);

    const diff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: { label: "HEAD", oid: "a".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
      hunkDrafts: [
        { path: enc("src/app.ts"), startBefore: 1, countBefore: 1, startAfter: 1, countAfter: 1, lines: ["+allowed line"] },
      ],
    });
    const leakingProtect: ContentProtectionPort = {
      protect: async (): Promise<SealedPayload> => {
        throw new Error(`boom ${token} in protect message`);
      },
    };
    const storeA = new FakeLatestStore();
    const sinkA = new FakeSink();
    const failedProtect = await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "index",
      capturedAt: 1_700_000_100_000, diff, plaintextPayload: enc("public"),
      protection: leakingProtect, store: storeA, sink: sinkA,
      batchId: "batch:l4b-m2-protect", generationId: "gen:0000000008",
    }).then(() => null, (error: unknown) => error);
    expect(failedProtect).not.toBeNull();
    const protectStrings = [
      ...(failedProtect instanceof Error ? [failedProtect.message, failedProtect.name] : [String(failedProtect)]),
    ];
    expect(scanValuesForLeak(protectStrings, [token])).toEqual([]);

    class NamingStore extends FakeLatestStore {
      override async replaceLatest(
        snapshot: LocalSnapshotDto, _expected: string | null, _generation: string,
      ): Promise<ReplaceLatestReceipt> {
        const error = new Error("replacement conflict");
        (error as { name: string }).name = token;
        throw error;
      }
    }
    const plainDiff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: { label: "HEAD", oid: "a".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    });
    const failedReplace = await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "index",
      capturedAt: 1_700_000_101_000, diff: plainDiff, plaintextPayload: null,
      protection: new FakeProtectionPort(), store: new NamingStore(), sink: new FakeSink(),
      batchId: "batch:l4b-m2-replace", generationId: "gen:0000000009",
    }).then(() => null, (error: unknown) => error);
    expect(failedReplace).not.toBeNull();
    const replaceStrings = [
      ...(failedReplace instanceof Error ? [failedReplace.message, failedReplace.name] : [String(failedReplace)]),
    ];
    expect(scanValuesForLeak(replaceStrings, [token])).toEqual([]);
  });

  it("structural M3: a late delivery is durably rejected, one state kept", async () => {
    const diff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    });
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
    let seenA = false;
    class GenerationSink implements FactSinkPort {
      readonly batches: FactBatchDto[] = [];
      private lastGeneration: string | null = null;
      private key(batch: FactBatchDto): string {
        return `${batch.scope.tenant}|${batch.scope.clone}`;
      }
      async deliver(batch: FactBatchDto): Promise<FactSinkReceipt> {
        if (batch.batchId === "batch:l4b-m3-a" && !seenA) {
          seenA = true;
          await gateA;
        }
        const current = this.lastGeneration;
        if (current !== null && batch.generationId <= current) {
          throw new Error("stale generation rejected: a newer delivery holds this target");
        }
        this.batches.push(batch);
        this.lastGeneration = batch.generationId;
        return { received: true, batchId: batch.batchId, retiredSuperseded: true, revokedDecryptability: true };
      }
    }
    const protection = new FakeProtectionPort();
    const store = new FakeLatestStore();
    const sink = new GenerationSink();
    const attemptA = stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_000_110_000, diff, plaintextPayload: enc("public A"),
      protection, store, sink,
      batchId: "batch:l4b-m3-a", generationId: "gen:0000000010",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const stagedB = await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_000_111_000, diff, plaintextPayload: enc("public B"),
      protection, store, sink,
      batchId: "batch:l4b-m3-b", generationId: "gen:0000000011",
    });
    releaseA();
    await expect(attemptA).rejects.toThrow();
    expect(sink.batches.map((b) => b.batchId)).toEqual(["batch:l4b-m3-b"]);
    expect(store.stored.map((s) => s.snapshotId)).toEqual([stagedB.snapshot.snapshotId]);
  });

  it("structural M4: conflict steps without metadata are excluded, coverage not current", async () => {
    const three: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      baseEntries: [],
      tipEntries: [],
      conflictStages: [
        { path: enc("src/clash.ts"), baseOid: "1".repeat(40), oursOid: "2".repeat(40), theirsOid: "3".repeat(40) },
      ],
      hunkDrafts: [
        { path: enc("src/clash.ts"), startBefore: 1, countBefore: 1, startAfter: 1, countAfter: 1, lines: [" conflict body"] },
      ],
    });
    expect(three.files).toHaveLength(1);
    expect(three.files[0]?.exclusion).toBeDefined();
    expect(three.files[0]?.hunks ?? []).toEqual([]);

    const onlyTwo: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      baseEntries: [],
      tipEntries: [],
      conflictStages: [
        { path: enc("src/clash.ts"), baseOid: null, oursOid: "2".repeat(40), theirsOid: null },
      ],
      hunkDrafts: [
        { path: enc("src/clash.ts"), startBefore: 1, countBefore: 1, startAfter: 1, countAfter: 1, lines: [" conflict body"] },
      ],
    });
    expect(onlyTwo.files).toHaveLength(1);
    expect(onlyTwo.files[0]?.exclusion).toBeDefined();
    expect(onlyTwo.files[0]?.hunks ?? []).toEqual([]);

    const protection = new FakeProtectionPort();
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const staged = await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "index",
      capturedAt: 1_700_000_120_000, diff: three, plaintextPayload: enc("public"),
      protection, store, sink,
      batchId: "batch:l4b-m4-conflict", generationId: "gen:0000000012",
    });
    expect(staged.coverage.state).not.toBe("current");
  });

  it("minor: a hunk-suspended capture across the purge never persists", async () => {
    let releaseProtect!: (value: SealedPayload) => void;
    const gate = new Promise<SealedPayload>((resolve) => { releaseProtect = resolve; });
    let calls = 0;
    const suspendedHunkProtection: ContentProtectionPort = {
      protect: (): Promise<SealedPayload> => {
        calls += 1;
        if (calls === 1) return gate;
        return Promise.resolve({ state: "sealed", algorithm: "fake-seal/1", keyRef: "fake-keyref-1", ciphertext: enc("sealed:1") });
      },
    };
    const diff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: { label: "HEAD", oid: "a".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      baseEntries: [entryLike("src/app.ts", "c".repeat(40))],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
      hunkDrafts: [
        { path: enc("src/app.ts"), startBefore: 1, countBefore: 1, startAfter: 1, countAfter: 1, lines: ["+suspended hunk line"] },
      ],
    });
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const attempt = stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "index",
      capturedAt: 1_700_000_130_000, diff, plaintextPayload: enc("public"),
      protection: suspendedHunkProtection, store, sink,
      batchId: "batch:l4b-minor-hunk-purge", generationId: "gen:0000000037",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const revocation: DeclarationRevocationDto = {
      declarationId: "decl:l4b-minor-hunk-purge",
      tenant: SCOPE.tenant,
      cloneId: SCOPE.clone,
      worktreeId: WORKTREE_ID,
      declarationRevision: 1,
      reason: "workspace-remove",
      requestPrivatePurge: {
        purgePrivateSnapshots: true, purgeDerivedIndexes: true,
        revokeDecryptability: true, preserveCommittedHistory: true,
      },
    };
    const purged = await runUnregisterPurge({ revocation, store });
    expect(purged.purgedPrivate).toBe(true);
    releaseProtect({ state: "sealed", algorithm: "fake-seal/1", keyRef: "fake-keyref-1", ciphertext: enc("sealed:22") });
    await expect(attempt).rejects.toThrow();
    expect(sink.batches).toEqual([]);
    expect(store.stored).toEqual([]);
  });

  it("minor: scope.worktree binds the snapshot and the batch", async () => {
    const diff: LocalDiffDto = deriveLocalDiff({
      scope: { tenant: SCOPE.tenant, clone: SCOPE.clone, worktree: "wt:one" },
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    });
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    await expect(stageLocalSnapshot({
      scope: { tenant: SCOPE.tenant, clone: SCOPE.clone, worktree: "wt:two" },
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_000_140_000,
      diff,
      plaintextPayload: enc("public"),
      protection: new FakeProtectionPort(),
      store,
      sink,
      batchId: "batch:l4b-minor-worktree",
      generationId: "gen:0000000038",
    })).rejects.toThrow();
    expect(sink.batches).toEqual([]);
  });
});

// L4b-sol4 — conception fixée par le conducteur (4 classes). Secrets
// SYNTHÉTIQUES uniquement : un seul jeton local reconnu par la politique.

const SOL4_TOKEN = "AKIAIOSFODNN7SYNTHETIC";

type Sol4LeafPath = readonly (string | number)[];

function sol4Clone<T>(value: T): T {
  if (value instanceof Uint8Array) return Uint8Array.from(value) as T;
  if (Array.isArray(value)) return value.map((item) => sol4Clone(item)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = sol4Clone(item);
    return out as T;
  }
  return value;
}

/** Tous les champs chaînes et octets du DTO, par réflexion (aucune liste codée en dur). */
function sol4LeafPaths(value: unknown): { path: Sol4LeafPath; bytes: boolean }[] {
  const out: { path: Sol4LeafPath; bytes: boolean }[] = [];
  const visit = (node: unknown, at: Sol4LeafPath): void => {
    if (typeof node === "string") out.push({ path: at, bytes: false });
    else if (node instanceof Uint8Array) out.push({ path: at, bytes: true });
    else if (Array.isArray(node)) node.forEach((item, index) => visit(item, [...at, index]));
    else if (node !== null && typeof node === "object") {
      for (const [key, item] of Object.entries(node as Record<string, unknown>)) visit(item, [...at, key]);
    }
  };
  visit(value, []);
  return out;
}

function sol4SetLeaf(root: unknown, path: Sol4LeafPath, value: unknown): void {
  let node = root as Record<string | number, unknown>;
  for (let index = 0; index < path.length - 1; index += 1) {
    node = node[path[index]!] as Record<string | number, unknown>;
  }
  node[path[path.length - 1]!] = value;
}

/** Exemplaire scellé valide : le diff final livré par un passage nominal. */
async function sol4SealedExemplar(): Promise<LocalDiffDto> {
  const diff: LocalDiffDto = deriveLocalDiff({
    scope: SCOPE,
    worktreeId: WORKTREE_ID,
    kind: "unstaged",
    base: { label: "index", oid: "b".repeat(40) },
    tip: { label: "worktree", oid: null },
    baseEntries: [],
    tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    hunkDrafts: [
      {
        path: enc("src/app.ts"),
        startBefore: 1,
        countBefore: 1,
        startAfter: 1,
        countAfter: 1,
        lines: ["+allowed line"],
      },
    ],
  });
  const outcome = await stageLocalSnapshot({
    scope: SCOPE,
    worktreeId: WORKTREE_ID,
    kind: "working-tree",
    capturedAt: 1_700_000_200_000,
    diff,
    plaintextPayload: enc("public exemplar"),
    protection: new FakeProtectionPort(),
    store: new FakeLatestStore(),
    sink: new FakeSink(),
    batchId: "batch:l4b-sol4-exemplar",
    generationId: "gen:0000000021",
  });
  return outcome.batch.facts[0] as LocalDiffDto;
}

type Sol4Mutator = (diff: LocalDiffDto) => void;

/** Un mutateur par champ : réflexion + emplacements nuls/absents explicites. */
function sol4Mutators(exemplar: LocalDiffDto): { name: string; mutate: Sol4Mutator }[] {
  const mutators: { name: string; mutate: Sol4Mutator }[] = sol4LeafPaths(exemplar).map((leaf) => ({
    name: leaf.path.join("."),
    mutate: (diff: LocalDiffDto) => {
      const last = String(leaf.path[leaf.path.length - 1]);
      const tokenValue = last === "worktreeId" ? `wt:${SOL4_TOKEN}` : SOL4_TOKEN;
      sol4SetLeaf(diff, leaf.path, leaf.bytes ? enc(tokenValue) : tokenValue);
    },
  }));
  mutators.push({
    name: "files.0.previousPath",
    mutate: (diff: LocalDiffDto) => {
      const file = (diff.files[0] as unknown as Record<string, unknown>);
      file["previousPath"] = enc(SOL4_TOKEN);
    },
  });
  mutators.push({
    name: "files.0.exclusion",
    mutate: (diff: LocalDiffDto) => {
      const file = (diff.files[0] as unknown as Record<string, unknown>);
      file["exclusion"] = SOL4_TOKEN;
    },
  });
  mutators.push({
    name: "coverage.reason",
    mutate: (diff: LocalDiffDto) => {
      (diff as unknown as Record<string, unknown>)["coverage"] = {
        axis: "working-tree",
        state: "partial",
        reason: SOL4_TOKEN,
      };
    },
  });
  return mutators;
}

let sol4AttemptSeq = 0;

async function sol4Attempt(
  mutated: LocalDiffDto,
  protection: ContentProtectionPort | null,
  store: FakeLatestStore,
  sink: FakeSink,
  tag: string,
): Promise<unknown> {
  sol4AttemptSeq += 1;
  return stageLocalSnapshot({
    scope: sol4Clone(mutated.scope),
    worktreeId: mutated.worktreeId,
    kind: "working-tree",
    capturedAt: 1_700_000_210_000,
    diff: mutated,
    plaintextPayload: enc("public sol4 direct"),
    protection,
    store,
    sink,
    batchId: `batch:l4b-sol4-${tag}`,
    generationId: `gen:${String(sol4AttemptSeq).padStart(10, "0")}`,
  }).then(
    () => null,
    (error: unknown) => error,
  );
}

describe("L4b-sol4 A: la porte unique du sink filtre chaque champ texte final", () => {
  it("parcours générique sur DTO direct : aucun jeton au sink, avec et sans clé", async () => {
    expect(containsSecretText(SOL4_TOKEN)).toBe(true);
    const exemplar = await sol4SealedExemplar();
    const mutators = sol4Mutators(exemplar);
    expect(mutators.length).toBeGreaterThan(5);
    let tag = 0;
    for (const keyMode of ["key", "nokey"] as const) {
      for (const mutator of mutators) {
        tag += 1;
        const mutated = sol4Clone(exemplar);
        mutator.mutate(mutated);
        const store = new FakeLatestStore();
        const sink = new FakeSink();
        const error = await sol4Attempt(
          mutated,
          keyMode === "key" ? new FakeProtectionPort() : null,
          store,
          sink,
          `${keyMode}-${tag}`,
        );
        expect(error, `champ ${mutator.name} (${keyMode})`).not.toBeNull();
        expect(sink.batches, `champ ${mutator.name} (${keyMode})`).toEqual([]);
        expect(
          scanValuesForLeak(collectStrings(sink.batches), [SOL4_TOKEN]),
          `champ ${mutator.name} (${keyMode})`,
        ).toEqual([]);
        expect(
          scanValuesForLeak(collectStrings(store.stored), [SOL4_TOKEN]),
          `champ ${mutator.name} (${keyMode})`,
        ).toEqual([]);
      }
    }
  });
});

describe("L4b-sol4 A: la porte ne sur-bloque pas les constats explicites", () => {
  it("une mise en retenue par règle explicite passe la porte unique", async () => {
    const diff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
      hunkDrafts: [
        {
          path: enc("src/app.ts"),
          startBefore: 1,
          countBefore: 1,
          startAfter: 1,
          countAfter: 1,
          lines: [`+token ${SOL4_TOKEN}`],
        },
      ],
    });
    expect(diff.files[0]?.hunks[0]?.payload.state).toBe("withheld");
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const outcome = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_000_220_000,
      diff,
      plaintextPayload: enc("public withheld"),
      protection: new FakeProtectionPort(),
      store,
      sink,
      batchId: "batch:l4b-sol4-withheld",
      generationId: "gen:0000000025",
    });
    expect(validateFactBatch(outcome.batch).ok).toBe(true);
    expect(sink.batches).toHaveLength(1);
  });
});

describe("L4b-sol4 B: les refus sont constants, jamais interpolés", () => {
  it("parcours générique : aucun jeton dans message, name, cause ni JSON de l'erreur", async () => {
    const exemplar = await sol4SealedExemplar();
    const mutators = sol4Mutators(exemplar);
    let tag = 0;
    for (const mutator of mutators) {
      tag += 1;
      const mutated = sol4Clone(exemplar);
      mutator.mutate(mutated);
      const error = await sol4Attempt(
        mutated,
        new FakeProtectionPort(),
        new FakeLatestStore(),
        new FakeSink(),
        `err-${tag}`,
      );
      expect(error, `champ ${mutator.name}`).not.toBeNull();
      const message = error instanceof Error ? error.message : String(error);
      const name = error instanceof Error ? error.name : "unknown";
      const cause = error instanceof Error ? (error as { cause?: unknown }).cause : undefined;
      expect(scanValuesForLeak([message, name], [SOL4_TOKEN]), `champ ${mutator.name}`).toEqual([]);
      if (cause !== undefined) {
        expect(scanValuesForLeak([String(cause)], [SOL4_TOKEN]), `champ ${mutator.name}`).toEqual([]);
      }
      expect(
        scanValuesForLeak([JSON.stringify({ message, name })], [SOL4_TOKEN]),
        `champ ${mutator.name}`,
      ).toEqual([]);
      const structural = validateLocalDiff(mutated);
      if (!structural.ok) {
        expect(scanValuesForLeak([...structural.errors], [SOL4_TOKEN]), `champ ${mutator.name}`).toEqual([]);
      }
      const sealed = validateSealedLocalDiff(mutated);
      if (!sealed.ok) {
        expect(scanValuesForLeak([...sealed.errors], [SOL4_TOKEN]), `champ ${mutator.name}`).toEqual([]);
      }
    }
  });
});

/**
 * Puits factice qui accuse réception comme un hôte à remplacement indexé
 * par cible et génération (L4b M2) : une seule tenue par cible, la plus
 * haute génération acceptée ; toute livraison à génération inférieure ou
 * égale est rejetée durablement ; accepter G retire tout état < G.
 */
class Sol4AckSink implements FactSinkPort {
  readonly batches: FactBatchDto[] = [];
  readonly holdings = new Map<string, FactBatchDto>();
  readonly arrived: string[] = [];
  failNext = false;
  readonly failBatchIds = new Set<string>();
  private readonly gates = new Map<string, { promise: Promise<void>; release: () => void }>();
  suspend(batchId: string): void {
    if (this.gates.has(batchId)) return;
    let release!: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    this.gates.set(batchId, { promise, release });
  }
  release(batchId: string): void {
    this.gates.get(batchId)?.release();
    this.gates.delete(batchId);
  }
  targetOf(batch: FactBatchDto): string {
    const snapshot = batch.facts.find(
      (fact): fact is LocalSnapshotDto =>
        typeof (fact as { snapshotId?: unknown }).snapshotId === "string",
    );
    // Sans snapshot (préservation instable : faits [diff, couverture]),
    // la cible se lit sur le diff et l'axe de couverture, jamais vide.
    const diff = batch.facts.find(
      (fact): fact is LocalDiffDto =>
        typeof (fact as { worktreeId?: unknown }).worktreeId === "string" &&
        Array.isArray((fact as { files?: unknown }).files),
    );
    const coverage = batch.facts.find(
      (fact): fact is { axis: string } =>
        typeof (fact as { axis?: unknown }).axis === "string",
    );
    const kind = snapshot?.kind ?? coverage?.axis ?? "working-tree";
    const diffKind = snapshot?.diffKind ?? diff?.kind ?? "unstaged";
    const worktree = batch.scope.worktree ?? "";
    const worktreeId = snapshot?.worktreeId ?? diff?.worktreeId ?? "";
    return `${batch.scope.tenant}|${batch.scope.clone}|${worktree}|${worktreeId}|${kind}|${diffKind}`;
  }
  async deliver(batch: FactBatchDto): Promise<FactSinkReceipt> {
    this.arrived.push(batch.batchId);
    const gate = this.gates.get(batch.batchId);
    if (gate !== undefined) await gate.promise;
    if (this.failBatchIds.has(batch.batchId) || this.failNext) {
      this.failNext = false;
      throw new Error("sink refused batch");
    }
    const target = this.targetOf(batch);
    const held = this.holdings.get(target);
    if (held !== undefined && batch.generationId <= held.generationId) {
      throw new Error("stale generation rejected: a newer delivery holds this target");
    }
    this.batches.push(batch);
    this.holdings.set(target, batch);
    return { received: true, batchId: batch.batchId, retiredSuperseded: true, revokedDecryptability: true };
  }
}

function sol4PolicyDiff(): LocalDiffDto {
  return deriveLocalDiff({
    scope: SCOPE,
    worktreeId: WORKTREE_ID,
    kind: "unstaged",
    base: { label: "index", oid: "b".repeat(40) },
    tip: { label: "worktree", oid: null },
    baseEntries: [],
    tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
  });
}

describe("L4b-sol4 C: le remplacement suit la génération acceptée par le sink", () => {
  it("A livré, B stocké mais non livré, C livré : le sink ne détient que C", async () => {
    const protection = new FakeProtectionPort();
    const store = new FakeLatestStore();
    const sink = new Sol4AckSink();
    const stage = (
      capturedAt: number,
      batchId: string,
      generationId: string,
    ): Promise<LocalSnapshotDto> =>
      stageLocalSnapshot({
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        kind: "working-tree",
        capturedAt,
        diff: sol4PolicyDiff(),
        plaintextPayload: enc(`public ${batchId}`),
        protection,
        store,
        sink,
        batchId,
        generationId,
      }).then((outcome) => outcome.snapshot);
    await stage(1_700_000_300_000, "batch:l4b-sol4-a", "gen:0000000022");
    sink.failNext = true;
    await expect(stage(1_700_000_301_000, "batch:l4b-sol4-b", "gen:0000000023")).rejects.toThrow();
    const snapshotC = await stage(1_700_000_302_000, "batch:l4b-sol4-c", "gen:0000000024");
    expect(sink.holdings.size).toBe(1);
    expect([...sink.holdings.values()].map((batch) => batch.batchId)).toEqual(["batch:l4b-sol4-c"]);
    expect(store.stored.map((entry) => entry.snapshotId)).toEqual([snapshotC.snapshotId]);
  });

  it("boucle de propriétés déterministe : le sink détient un seul état, le dernier accepté", async () => {
    let seed = 0x2f6e2b2d;
    const random = (): number => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const protection = new FakeProtectionPort();
    const store = new FakeLatestStore();
    const sink = new Sol4AckSink();
    const acceptedGenerations: string[] = [];
    let lastAccepted: FactBatchDto | null = null;
    for (let step = 0; step < 60; step += 1) {
      const generationId = `gen:${String(step).padStart(10, "0")}`;
      const roll = random();
      if (roll >= 0.8 && acceptedGenerations.length > 0) {
        await expect(
          stageLocalSnapshot({
            scope: SCOPE,
            worktreeId: WORKTREE_ID,
            kind: "working-tree",
            capturedAt: 1_700_000_400_000 + step,
            diff: sol4PolicyDiff(),
            plaintextPayload: enc(`public prop ${step}`),
            protection,
            store,
            sink,
            batchId: `batch:l4b-sol4-prop-${step}`,
            generationId: "gen:0000000000",
          }),
        ).rejects.toThrow();
        continue;
      }
      if (roll >= 0.6) sink.failNext = true;
      const error = await stageLocalSnapshot({
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        kind: "working-tree",
        capturedAt: 1_700_000_400_000 + step,
        diff: sol4PolicyDiff(),
        plaintextPayload: enc(`public prop ${step}`),
        protection,
        store,
        sink,
        batchId: `batch:l4b-sol4-prop-${step}`,
        generationId,
      }).then(
        (outcome) => ({ batch: outcome.batch as FactBatchDto | null, error: null as unknown }),
        (failure: unknown) => ({ batch: null, error: failure }),
      );
      if (error.batch !== null) {
        lastAccepted = error.batch;
        acceptedGenerations.push(error.batch.generationId);
      } else {
        expect(error.error).not.toBeNull();
      }
    }
    expect(lastAccepted).not.toBeNull();
    expect(sink.holdings.size).toBe(1);
    expect([...sink.holdings.values()].map((batch) => batch.batchId)).toEqual([lastAccepted!.batchId]);
    // Les générations acceptées croissent strictement dans l'ordre
    // d'acceptation : toute livraison tardive est rejetée durablement.
    const ordered = [...acceptedGenerations].sort();
    expect(acceptedGenerations).toEqual(ordered);
    expect(new Set(acceptedGenerations).size).toBe(acceptedGenerations.length);
    for (const batch of sink.batches) {
      expect(validateFactBatch(batch).ok).toBe(true);
    }
  });
});

// L4b-M1 (conducteur tour 5) — aucun texte libre dans le DTO émis : chaque
// champ chaîne vers le sink est une énumération fermée, un identifiant
// opaque strict, un chemin protégé ou un scellé. Code privé SYNTHÉTIQUE sans
// motif reconnu : seule la fermeture du schéma peut le refuser.

const M1_PRIVATE_CODE = "function calculInterneConfidentiel() { return 48151623; }";

async function m1ValidBatch(): Promise<FactBatchDto> {
  const outcome = await stageLocalSnapshot({
    scope: SCOPE,
    worktreeId: WORKTREE_ID,
    kind: "working-tree",
    capturedAt: 1_700_000_600_000,
    diff: sol4PolicyDiff(),
    plaintextPayload: enc("public m1 exemplar"),
    protection: new FakeProtectionPort(),
    store: new FakeLatestStore(),
    sink: new FakeSink(),
    batchId: "batch:l4b-m1-valid",
    generationId: "gen:0000000033",
  });
  expect(validateFactBatch(outcome.batch).ok).toBe(true);
  return outcome.batch;
}

describe("L4b-M1: aucun texte libre dans le DTO émis", () => {
  it("schéma fermé : le code privé dans chaque champ chaîne du lot est refusé", async () => {
    expect(containsSecretText(M1_PRIVATE_CODE)).toBe(false);
    const batch = await m1ValidBatch();
    const leaves = sol4LeafPaths(batch).filter((leaf) => !leaf.bytes);
    expect(leaves.length).toBeGreaterThan(5);
    for (const leaf of leaves) {
      const mutated = sol4Clone(batch);
      sol4SetLeaf(mutated, leaf.path, M1_PRIVATE_CODE);
      expect(validateFactBatch(mutated).ok, `champ ${leaf.path.join(".")}`).toBe(false);
    }
  });

  it("porte unique : le code privé dans chaque champ chaîne d'un diff direct est refusé, avec et sans clé", async () => {
    const exemplar = await sol4SealedExemplar();
    const leaves = sol4LeafPaths(exemplar).filter((leaf) => !leaf.bytes);
    expect(leaves.length).toBeGreaterThan(5);
    let tag = 0;
    for (const keyMode of ["key", "nokey"] as const) {
      for (const leaf of leaves) {
        tag += 1;
        const mutated = sol4Clone(exemplar);
        sol4SetLeaf(mutated, leaf.path, M1_PRIVATE_CODE);
        const store = new FakeLatestStore();
        const sink = new FakeSink();
        const error = await sol4Attempt(
          mutated,
          keyMode === "key" ? new FakeProtectionPort() : null,
          store,
          sink,
          `m1-${keyMode}-${tag}`,
        );
        expect(error, `champ ${leaf.path.join(".")} (${keyMode})`).not.toBeNull();
        expect(sink.batches, `champ ${leaf.path.join(".")} (${keyMode})`).toEqual([]);
        expect(store.stored, `champ ${leaf.path.join(".")} (${keyMode})`).toEqual([]);
      }
      const extra: { name: string; mutate: (diff: LocalDiffDto) => void }[] = [
        {
          name: "withheld.reason",
          mutate: (diff: LocalDiffDto) => {
            const file = diff.files[0] as unknown as { hunks: { payload: unknown }[] };
            file.hunks[0]!.payload = { state: "withheld", reason: M1_PRIVATE_CODE };
          },
        },
        {
          name: "coverage.reason",
          mutate: (diff: LocalDiffDto) => {
            (diff as unknown as Record<string, unknown>)["coverage"] = {
              axis: "working-tree",
              state: "partial",
              reason: M1_PRIVATE_CODE,
            };
          },
        },
      ];
      for (const item of extra) {
        tag += 1;
        const mutated = sol4Clone(exemplar);
        item.mutate(mutated);
        const store = new FakeLatestStore();
        const sink = new FakeSink();
        const error = await sol4Attempt(
          mutated,
          keyMode === "key" ? new FakeProtectionPort() : null,
          store,
          sink,
          `m1-${keyMode}-${tag}`,
        );
        expect(error, `${item.name} (${keyMode})`).not.toBeNull();
        expect(sink.batches, `${item.name} (${keyMode})`).toEqual([]);
        expect(store.stored, `${item.name} (${keyMode})`).toEqual([]);
      }
      for (const field of ["batchId", "generationId"] as const) {
        tag += 1;
        const store = new FakeLatestStore();
        const sink = new FakeSink();
        const error = await stageLocalSnapshot({
          scope: SCOPE,
          worktreeId: WORKTREE_ID,
          kind: "working-tree",
          capturedAt: 1_700_000_610_000,
          diff: sol4Clone(exemplar),
          plaintextPayload: enc("public m1 direct"),
          protection: keyMode === "key" ? new FakeProtectionPort() : null,
          store,
          sink,
          batchId: field === "batchId" ? M1_PRIVATE_CODE : `batch:l4b-m1-${keyMode}-${tag}`,
          generationId: field === "generationId" ? M1_PRIVATE_CODE : `gen:${String(tag).padStart(10, "0")}`,
        }).then(
          () => null,
          (failure: unknown) => failure,
        );
        expect(error, `${field} (${keyMode})`).not.toBeNull();
        expect(sink.batches, `${field} (${keyMode})`).toEqual([]);
        expect(store.stored, `${field} (${keyMode})`).toEqual([]);
      }
    }
  });
});

// L4b-M2 (conducteur tour 5) — remplacement par cible, pas par prédécesseur :
// pour une cible donnée le sink ne conserve que la génération la plus élevée
// acceptée ; toute livraison de génération inférieure ou égale est rejetée
// durablement ; accepter G retire tout état de génération inférieure.

describe("L4b-mineur: les refus SnapshotError sont des constantes structurées", () => {
  it("messages constants, détails en codes énumérés et indices numériques, jamais de join", async () => {
    const exemplar = await sol4SealedExemplar();
    const mutatedScope = sol4Clone(exemplar);
    mutatedScope.scope = { tenant: "tenant with spaces", clone: "clone:l4b-mineur" };
    const mutatedReason = sol4Clone(exemplar);
    (mutatedReason as unknown as Record<string, unknown>)["coverage"] = {
      axis: "working-tree",
      state: "partial",
      reason: M1_PRIVATE_CODE,
    };
    const attempts: Promise<unknown>[] = [
      stageLocalSnapshot({
        scope: { tenant: "tenant with spaces", clone: "clone:l4b-mineur" },
        worktreeId: WORKTREE_ID,
        kind: "working-tree",
        capturedAt: 1_700_000_900_000,
        diff: sol4Clone(exemplar),
        plaintextPayload: enc("public mineur"),
        protection: new FakeProtectionPort(),
        store: new FakeLatestStore(),
        sink: new FakeSink(),
        batchId: "batch:l4b-mineur-scope",
        generationId: "gen:0000000017",
      }).then(() => null, (error: unknown) => error),
      stageLocalSnapshot({
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        kind: "working-tree",
        capturedAt: 1_700_000_901_000,
        diff: mutatedScope,
        plaintextPayload: enc("public mineur"),
        protection: new FakeProtectionPort(),
        store: new FakeLatestStore(),
        sink: new FakeSink(),
        batchId: "batch:l4b-mineur-diff",
        generationId: "gen:0000000018",
      }).then(() => null, (error: unknown) => error),
      stageLocalSnapshot({
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        kind: "working-tree",
        capturedAt: 1_700_000_902_000,
        diff: mutatedReason,
        plaintextPayload: enc("public mineur"),
        protection: new FakeProtectionPort(),
        store: new FakeLatestStore(),
        sink: new FakeSink(),
        batchId: "batch:l4b-mineur-reason",
        generationId: "gen:0000000019",
      }).then(() => null, (error: unknown) => error),
      stageLocalSnapshot({
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        kind: "working-tree",
        capturedAt: 1_700_000_903_000,
        diff: sol4Clone(exemplar),
        plaintextPayload: enc("public mineur"),
        protection: new FakeProtectionPort(),
        store: new FakeLatestStore(),
        sink: new FakeSink(),
        batchId: "not a batch id",
        generationId: "gen:0000000020",
      }).then(() => null, (error: unknown) => error),
      runUnregisterPurge({
        revocation: {
          declarationId: "decl:l4b-mineur",
          tenant: SCOPE.tenant,
          cloneId: SCOPE.clone,
          worktreeId: WORKTREE_ID,
          declarationRevision: 0,
          reason: "workspace-remove",
          requestPrivatePurge: {
            purgePrivateSnapshots: true,
            purgeDerivedIndexes: true,
            revokeDecryptability: true,
            preserveCommittedHistory: true,
          },
        },
        store: new FakeLatestStore(),
      }).then(() => null, (error: unknown) => error),
    ];
    const allowed = new Set<string>(SNAPSHOT_ERROR_CODES as readonly string[]);
    let structured = 0;
    for (const attempt of attempts) {
      const error = await attempt;
      expect(error).toBeInstanceOf(SnapshotError);
      const refusal = error as SnapshotError;
      expect(allowed.has(refusal.message)).toBe(true);
      expect(refusal.code).toBe(refusal.message);
      expect(Array.isArray(refusal.details.codes)).toBe(true);
      expect(Array.isArray(refusal.details.indices)).toBe(true);
      for (const code of refusal.details.codes) expect(allowed.has(code)).toBe(true);
      for (const index of refusal.details.indices) expect(Number.isSafeInteger(index)).toBe(true);
      expect(JSON.stringify(refusal.details)).not.toContain(";");
      if (refusal.details.indices.length > 0) structured += 1;
    }
    expect(structured).toBeGreaterThan(0);
  });
});

async function m2WaitForArrival(sink: Sol4AckSink, batchId: string): Promise<void> {
  for (let round = 0; round < 1000 && !sink.arrived.includes(batchId); round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  expect(sink.arrived).toContain(batchId);
}

describe("L4b-M2: le sink remplace par cible et génération", () => {
  it("A livré, B et C suspendus : B puis C → seul C ; C puis B → seul C, B rejeté", async () => {
    for (const order of ["BC", "CB"] as const) {
      const protection = new FakeProtectionPort();
      const store = new FakeLatestStore();
      const sink = new Sol4AckSink();
      const stage = (capturedAt: number, batchId: string, generationId: string) =>
        stageLocalSnapshot({
          scope: SCOPE,
          worktreeId: WORKTREE_ID,
          kind: "working-tree",
          capturedAt,
          diff: sol4PolicyDiff(),
          plaintextPayload: enc(`public m2 ${batchId}`),
          protection,
          store,
          sink,
          batchId,
          generationId,
        }).then((outcome) => outcome.snapshot);
      await stage(1_700_000_700_000, "batch:l4b-m2-a", "gen:0000000034");
      sink.suspend("batch:l4b-m2-b");
      sink.suspend("batch:l4b-m2-c");
      const attemptB = stage(1_700_000_701_000, "batch:l4b-m2-b", "gen:0000000035");
      await m2WaitForArrival(sink, "batch:l4b-m2-b");
      const attemptC = stage(1_700_000_702_000, "batch:l4b-m2-c", "gen:0000000036");
      await m2WaitForArrival(sink, "batch:l4b-m2-c");
      if (order === "BC") {
        sink.release("batch:l4b-m2-b");
        await attemptB;
        sink.release("batch:l4b-m2-c");
        await attemptC;
        expect(sink.batches.map((b) => b.batchId)).toEqual([
          "batch:l4b-m2-a",
          "batch:l4b-m2-b",
          "batch:l4b-m2-c",
        ]);
      } else {
        sink.release("batch:l4b-m2-c");
        await attemptC;
        sink.release("batch:l4b-m2-b");
        await expect(attemptB).rejects.toThrow();
        expect(sink.batches.map((b) => b.batchId)).toEqual([
          "batch:l4b-m2-a",
          "batch:l4b-m2-c",
        ]);
      }
      expect(sink.holdings.size, `ordre ${order}`).toBe(1);
      expect([...sink.holdings.values()].map((b) => b.batchId), `ordre ${order}`).toEqual([
        "batch:l4b-m2-c",
      ]);
      expect(store.stored).toHaveLength(1);
    }
  });

  it("boucle de propriétés concurrente : chevauchements et ordres aléatoires, un seul état = la plus haute génération acceptée", async () => {
    let seed = 0x1b3c5d7f;
    const random = (): number => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const STEPS = 40;
    const protection = new FakeProtectionPort();
    const store = new FakeLatestStore();
    const sink = new Sol4AckSink();
    const batchIdOf = (step: number): string => `batch:l4b-m2c-${String(step).padStart(3, "0")}`;
    const generationOf = (step: number): string => `gen:${String(step).padStart(10, "0")}`;
    const failing = new Set<number>();
    for (let step = 0; step < STEPS; step += 1) {
      if (random() < 0.2) failing.add(step);
      sink.suspend(batchIdOf(step));
    }
    const order = Array.from({ length: STEPS }, (_, step) => step);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    if (failing.size === STEPS) failing.delete(order[order.length - 1]!);
    for (const step of failing) sink.failBatchIds.add(batchIdOf(step));
    const attempts: Promise<LocalSnapshotDto>[] = [];
    for (let step = 0; step < STEPS; step += 1) {
      attempts.push(
        stageLocalSnapshot({
          scope: SCOPE,
          worktreeId: WORKTREE_ID,
          kind: "working-tree",
          capturedAt: 1_700_000_800_000 + step,
          diff: sol4PolicyDiff(),
          plaintextPayload: enc(`public m2c ${step}`),
          protection,
          store,
          sink,
          batchId: batchIdOf(step),
          generationId: generationOf(step),
        }).then((outcome) => outcome.snapshot),
      );
      await m2WaitForArrival(sink, batchIdOf(step));
    }
    for (const step of order) sink.release(batchIdOf(step));
    const settled = await Promise.allSettled(attempts);
    let maxGeneration = "";
    const expectedAccepted = new Map<number, boolean>();
    for (const step of order) {
      const generation = generationOf(step);
      if (failing.has(step) || generation <= maxGeneration) {
        expectedAccepted.set(step, false);
      } else {
        expectedAccepted.set(step, true);
        maxGeneration = generation;
      }
    }
    settled.forEach((result, step) => {
      expect(result.status === "fulfilled", `étape ${step}`).toBe(expectedAccepted.get(step));
    });
    const acceptedSteps = order.filter((step) => expectedAccepted.get(step));
    expect(acceptedSteps.length).toBeGreaterThan(0);
    const winner = Math.max(...acceptedSteps);
    expect(sink.holdings.size).toBe(1);
    expect([...sink.holdings.values()][0]!.batchId).toBe(batchIdOf(winner));
    expect([...sink.holdings.values()][0]!.generationId).toBe(generationOf(winner));
    for (const batch of sink.batches) {
      expect(validateFactBatch(batch).ok).toBe(true);
    }
    expect(store.stored).toHaveLength(1);
  });
});

// L4b-sol5 — prescriptions du conducteur tour 5. Code privé SYNTHÉTIQUE
// sans motif reconnu : seule la fermeture du schéma et la preuve de
// scellement peuvent le refuser.

const SOL5_PRIVATE_CODE = "function calculInterneConfidentiel() { return 48151623; }";

/** Puits à livraison suspendue par lot : l'admission précède la reprise. */
class Sol5GateSink implements FactSinkPort {
  readonly batches: FactBatchDto[] = [];
  readonly arrived: string[] = [];
  private readonly gates = new Map<string, { promise: Promise<void>; release: () => void }>();
  suspend(batchId: string): void {
    if (this.gates.has(batchId)) return;
    let release!: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    this.gates.set(batchId, { promise, release });
  }
  release(batchId: string): void {
    this.gates.get(batchId)?.release();
    this.gates.delete(batchId);
  }
  async deliver(batch: FactBatchDto): Promise<FactSinkReceipt> {
    this.arrived.push(batch.batchId);
    const gate = this.gates.get(batch.batchId);
    if (gate !== undefined) await gate.promise;
    this.batches.push(batch);
    return { received: true, batchId: batch.batchId, retiredSuperseded: true, revokedDecryptability: true };
  }
}

async function sol5WaitForArrival(sink: Sol5GateSink, batchId: string): Promise<void> {
  for (let round = 0; round < 1000 && !sink.arrived.includes(batchId); round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  expect(sink.arrived).toContain(batchId);
}

/** Diff porteur d'un hunk scellé fourni directement par l'appelant. */
function sol5DirectSealedDiff(): LocalDiffDto {
  const diff: LocalDiffDto = deriveLocalDiff({
    scope: SCOPE,
    worktreeId: WORKTREE_ID,
    kind: "unstaged",
    base: { label: "index", oid: "b".repeat(40) },
    tip: { label: "worktree", oid: null },
    baseEntries: [],
    tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    hunkDrafts: [
      {
        path: enc("src/app.ts"),
        startBefore: 1,
        countBefore: 1,
        startAfter: 1,
        countAfter: 1,
        lines: ["+allowed line"],
      },
    ],
  });
  const file = diff.files[0] as unknown as { hunks: { payload: unknown }[] };
  file.hunks[0]!.payload = {
    state: "sealed",
    algorithm: "fake-seal/1",
    keyRef: "fake-keyref-1",
    ciphertext: enc(SOL5_PRIVATE_CODE),
  };
  return diff;
}

describe("L4b-sol5 Majeur 1 : aucun sealed fourni par l'appelant n'atteint le sink", () => {
  it("hunk direct sealed au ciphertext clair refusé, avec et sans clé, rien au sink", async () => {
    expect(containsSecretText(SOL5_PRIVATE_CODE)).toBe(false);
    for (const keyMode of ["key", "nokey"] as const) {
      const store = new FakeLatestStore();
      const sink = new FakeSink();
      const error = await stageLocalSnapshot({
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        kind: "working-tree",
        capturedAt: 1_700_001_000_000,
        diff: sol5DirectSealedDiff(),
        plaintextPayload: enc("public sol5 sealed direct"),
        protection: keyMode === "key" ? new FakeProtectionPort() : null,
        store,
        sink,
        batchId: `batch:l4b-sol5-sealed-${keyMode}`,
        generationId: keyMode === "key" ? "gen:0000000001" : "gen:0000000002",
      }).then(
        () => null,
        (failure: unknown) => failure,
      );
      expect(error, `mode ${keyMode}`).toBeInstanceOf(SnapshotError);
      const refusal = error as SnapshotError;
      expect(new Set<string>(SNAPSHOT_ERROR_CODES as readonly string[]).has(refusal.message), `mode ${keyMode}`).toBe(true);
      expect(sink.batches, `mode ${keyMode}`).toEqual([]);
      expect(store.stored, `mode ${keyMode}`).toEqual([]);
      expect(
        scanValuesForLeak(collectStrings(sink.batches), [SOL5_PRIVATE_CODE]),
        `mode ${keyMode}`,
      ).toEqual([]);
    }
  });
});

describe("L4b-sol5 Majeur 2 : le lot est copié et gelé à l'admission", () => {
  it("livraison suspendue : la mutation du DTO d'origine (withheld + octets) ne traverse pas", async () => {
    const diff: LocalDiffDto = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: { label: "HEAD", oid: "a".repeat(40) },
      tip: { label: "index", oid: "b".repeat(40) },
      baseEntries: [entryLike("src/app.ts", "c".repeat(40))],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
      hunkDrafts: [
        {
          path: enc("src/app.ts"),
          startBefore: 1,
          countBefore: 1,
          startAfter: 1,
          countAfter: 1,
          lines: [`+token ${SOL4_TOKEN}`],
        },
      ],
    });
    const hunk = diff.files[0]?.hunks[0];
    expect(hunk?.payload.state).toBe("withheld");
    const admittedReason = (hunk?.payload as { reason: string }).reason;
    const admittedPath = Uint8Array.from(diff.files[0]!.path);
    const store = new FakeLatestStore();
    const sink = new Sol5GateSink();
    sink.suspend("batch:l4b-sol5-frozen");
    const attempt = stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "index",
      capturedAt: 1_700_001_001_000,
      diff,
      plaintextPayload: enc("public sol5 frozen"),
      protection: new FakeProtectionPort(),
      store,
      sink,
      batchId: "batch:l4b-sol5-frozen",
      generationId: "gen:0000000027",
    });
    await sol5WaitForArrival(sink, "batch:l4b-sol5-frozen");
    // Mutation du DTO d'origine APRÈS admission, avant reprise.
    const originHunk = diff.files[0]?.hunks[0] as unknown as { payload: Record<string, unknown> };
    originHunk.payload["reason"] = SOL5_PRIVATE_CODE;
    diff.files[0]!.path.fill(0x58);
    sink.release("batch:l4b-sol5-frozen");
    await attempt;
    expect(sink.batches).toHaveLength(1);
    const delivered = sink.batches[0]!.facts[0] as LocalDiffDto;
    expect((delivered.files[0]?.hunks[0]?.payload as { reason: string }).reason).toBe(admittedReason);
    expect(delivered.files[0]?.hunks[0]?.payload).not.toMatchObject({ reason: SOL5_PRIVATE_CODE });
    expect(Array.from(delivered.files[0]!.path)).toEqual(Array.from(admittedPath));
    expect(
      scanValuesForLeak(collectStrings(sink.batches), [SOL5_PRIVATE_CODE]),
    ).toEqual([]);
  });

  it("charge utile suspendue : la mutation du tampon d'origine ne traverse pas protect", async () => {
    const original = enc("public sol5 payload");
    const seen: Uint8Array[] = [];
    let releaseProtect!: (value: SealedPayload) => void;
    const gate = new Promise<SealedPayload>((resolve) => { releaseProtect = resolve; });
    const suspending: ContentProtectionPort = {
      protect: (plaintext: Uint8Array): Promise<SealedPayload> => {
        seen.push(plaintext);
        return gate;
      },
    };
    const attempt = stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_001_002_000,
      diff: sol4PolicyDiff(),
      plaintextPayload: original,
      protection: suspending,
      store: new FakeLatestStore(),
      sink: new FakeSink(),
      batchId: "batch:l4b-sol5-payload",
      generationId: "gen:0000000028",
    });
    for (let round = 0; round < 1000 && seen.length === 0; round += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(seen).toHaveLength(1);
    // Mutation du tampon d'origine APRÈS admission, avant reprise.
    original.fill(0x59);
    releaseProtect({
      state: "sealed",
      algorithm: "fake-seal/1",
      keyRef: "fake-keyref-1",
      ciphertext: enc("sealed:22"),
    });
    await attempt;
    expect(Array.from(seen[0]!)).toEqual(Array.from(enc("public sol5 payload")));
  });
});

describe("L4b-sol5 mineur : le faux sink vise la même cible sans snapshot", () => {
  it("A valide puis capture instable : une seule tenue, cible complète", async () => {
    const protection = new FakeProtectionPort();
    const store = new FakeLatestStore();
    const sink = new Sol4AckSink();
    await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_001_003_000,
      diff: sol4PolicyDiff(),
      plaintextPayload: enc("public sol5 target"),
      protection,
      store,
      sink,
      batchId: "batch:l4b-sol5-target-a",
      generationId: "gen:0000000029",
    });
    const unstable = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [],
      stable: false,
      unstableReason: "capture loop raced an index rewrite",
    });
    await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_001_004_000,
      diff: unstable,
      plaintextPayload: enc("public sol5 unstable"),
      protection,
      store,
      sink,
      batchId: "batch:l4b-sol5-target-b",
      generationId: "gen:0000000030",
    });
    expect(sink.holdings.size).toBe(1);
    const target = [...sink.holdings.keys()][0]!;
    expect(target).toContain(WORKTREE_ID);
    expect(target.split("|")).toHaveLength(6);
    expect(target.split("|")[4]).not.toBe("");
    expect(target.split("|")[5]).toBe("unstaged");
  });
});

// L4b-sol6 — variantes du tour 6. Données SYNTHÉTIQUES sans motif reconnu.

function sol6OpenDiff(): LocalDiffDto {
  return deriveLocalDiff({
    scope: SCOPE,
    worktreeId: WORKTREE_ID,
    kind: "unstaged",
    base: { label: "index", oid: "b".repeat(40) },
    tip: { label: "worktree", oid: null },
    baseEntries: [],
    tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    hunkDrafts: [
      {
        path: enc("src/app.ts"),
        startBefore: 1,
        countBefore: 1,
        startAfter: 1,
        countAfter: 1,
        lines: ["+allowed line"],
      },
    ],
  });
}

/** Magasin à remplacement suspendu : l'admission précède la reprise. */
class Sol6GateStore extends FakeLatestStore {
  readonly arrived: string[] = [];
  private readonly gates = new Map<string, { promise: Promise<void>; release: () => void }>();
  suspend(generationId: string): void {
    if (this.gates.has(generationId)) return;
    let release!: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    this.gates.set(generationId, { promise, release });
  }
  release(generationId: string): void {
    this.gates.get(generationId)?.release();
    this.gates.delete(generationId);
  }
  override async replaceLatest(
    snapshot: LocalSnapshotDto,
    expectedSupersededId: string | null,
    generationId: string,
  ): Promise<ReplaceLatestReceipt> {
    this.arrived.push(generationId);
    const gate = this.gates.get(generationId);
    if (gate !== undefined) await gate.promise;
    return super.replaceLatest(snapshot, expectedSupersededId, generationId);
  }
}

async function sol6WaitForStore(store: Sol6GateStore, generationId: string): Promise<void> {
  for (let round = 0; round < 1000 && !store.arrived.includes(generationId); round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  expect(store.arrived).toContain(generationId);
}

describe("L4b-sol6 variante 1 : les tampons rendus par protect sont isolés", () => {
  it("mutation après admission de chaque tampon pendant une livraison suspendue : le sink reçoit le scellé d'origine", async () => {
    const combos = [
      ["buffer", "buffer"],
      ["buffer", "bytes"],
      ["bytes", "buffer"],
      ["bytes", "bytes"],
    ] as const;
    let tag = 0;
    for (const [hunkKind, snapshotKind] of combos) {
      tag += 1;
      const hunkOriginal = hunkKind === "buffer"
        ? Buffer.from(enc("sealed-sol6-hunk"))
        : enc("sealed-sol6-hunk");
      const snapshotOriginal = snapshotKind === "buffer"
        ? Buffer.from(enc("sealed-sol6-snapshot"))
        : enc("sealed-sol6-snapshot");
      const hunkExpected = Array.from(hunkOriginal);
      const snapshotExpected = Array.from(snapshotOriginal);
      let calls = 0;
      let hunkRef: Uint8Array | null = null;
      let snapshotRef: Uint8Array | null = null;
      const protection: ContentProtectionPort = {
        protect: async (): Promise<SealedPayload> => {
          calls += 1;
          if (calls === 1) {
            hunkRef = hunkKind === "buffer" ? Buffer.from(hunkOriginal) : Uint8Array.from(hunkOriginal);
            return { state: "sealed", algorithm: "fake-seal/1", keyRef: "fake-keyref-1", ciphertext: hunkRef };
          }
          snapshotRef = snapshotKind === "buffer" ? Buffer.from(snapshotOriginal) : Uint8Array.from(snapshotOriginal);
          return { state: "sealed", algorithm: "fake-seal/1", keyRef: "fake-keyref-1", ciphertext: snapshotRef };
        },
      };
      const sink = new Sol5GateSink();
      const store = new Sol6GateStore();
      const batchId = `batch:l4b-sol6-buffer-${tag}`;
      const generationId = `gen:${String(tag).padStart(10, "0")}`;
      store.suspend(generationId);
      sink.suspend(batchId);
      const attempt = stageLocalSnapshot({
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        kind: "working-tree",
        capturedAt: 1_700_002_000_000 + tag,
        diff: sol6OpenDiff(),
        plaintextPayload: enc("public sol6 buffers"),
        protection,
        store,
        sink,
        batchId,
        generationId,
      });
      await sol6WaitForStore(store, generationId);
      expect(hunkRef, `hunk ${hunkKind}/${snapshotKind}`).not.toBeNull();
      expect(snapshotRef, `snapshot ${hunkKind}/${snapshotKind}`).not.toBeNull();
      // Mutation des tampons du port AVANT la reprise du magasin (fenêtre
      // entre protect et copie de livraison) puis avant reprise du sink.
      hunkRef!.fill(0x5a);
      snapshotRef!.fill(0x5a);
      store.release(generationId);
      await sol5WaitForArrival(sink, batchId);
      hunkRef!.fill(0x5b);
      snapshotRef!.fill(0x5b);
      sink.release(batchId);
      await attempt;
      expect(sink.batches, `${hunkKind}/${snapshotKind}`).toHaveLength(1);
      const deliveredDiff = sink.batches[0]!.facts[0] as LocalDiffDto;
      const deliveredSnapshot = sink.batches[0]!.facts[1] as LocalSnapshotDto;
      const deliveredHunkCipher = (deliveredDiff.files[0]?.hunks[0]?.payload as { ciphertext: Uint8Array }).ciphertext;
      const deliveredSnapshotCipher = (deliveredSnapshot.sealed as { ciphertext: Uint8Array }).ciphertext;
      expect(Array.from(deliveredHunkCipher), `hunk ${hunkKind}/${snapshotKind}`).toEqual(hunkExpected);
      expect(Array.from(deliveredSnapshotCipher), `snapshot ${hunkKind}/${snapshotKind}`).toEqual(snapshotExpected);
      expect(deliveredHunkCipher, `hunk ${hunkKind}/${snapshotKind}`).not.toBe(hunkRef);
      expect(deliveredSnapshotCipher, `snapshot ${hunkKind}/${snapshotKind}`).not.toBe(snapshotRef);
    }
  });

  it("mutation du snapshot retourné : le lot livré garde le scellé d'origine", async () => {
    const protection: ContentProtectionPort = {
      protect: async (): Promise<SealedPayload> => ({
        state: "sealed",
        algorithm: "fake-seal/1",
        keyRef: "fake-keyref-1",
        ciphertext: Buffer.from(enc("sealed-sol6-returned")),
      }),
    };
    const sink = new FakeSink();
    const outcome = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_002_010_000,
      diff: sol6OpenDiff(),
      plaintextPayload: enc("public sol6 returned"),
      protection,
      store: new FakeLatestStore(),
      sink,
      batchId: "batch:l4b-sol6-returned",
      generationId: "gen:0000000031",
    });
    const returnedCipher = (outcome.snapshot.sealed as { ciphertext: Uint8Array }).ciphertext;
    const expected = Array.from(returnedCipher);
    returnedCipher.fill(0x5b);
    const deliveredSnapshot = sink.batches[0]!.facts[1] as LocalSnapshotDto;
    const deliveredCipher = (deliveredSnapshot.sealed as { ciphertext: Uint8Array }).ciphertext;
    expect(Array.from(deliveredCipher)).toEqual(expected);
    expect(deliveredCipher).not.toBe(returnedCipher);
  });
});

describe("L4b-sol6 variante 2 : clé propre __proto__/constructor/prototype refusée", () => {
  it("DTO avec clé propre issue de JSON.parse ou defineProperty : refus, rien au sink", async () => {
    const forbidden = ["__proto__", "constructor", "prototype"] as const;
    let tag = 0;
    for (const key of forbidden) {
      for (const via of ["json", "define"] as const) {
        tag += 1;
        const diff = sol6OpenDiff();
        const payload = (diff.files[0]?.hunks[0] as unknown as { payload: unknown }).payload;
        if (via === "json") {
          const raw = JSON.parse(`{"state":"withheld","reason":"withheld-secret-unknown",${JSON.stringify(key)}:{"polluted":true}}`) as Record<string, unknown>;
          (diff.files[0]?.hunks[0] as unknown as { payload: unknown }).payload = raw;
        } else {
          Object.defineProperty(payload, key, { value: { polluted: true }, enumerable: true, configurable: true, writable: true });
        }
        const store = new FakeLatestStore();
        const sink = new FakeSink();
        const error = await stageLocalSnapshot({
          scope: SCOPE,
          worktreeId: WORKTREE_ID,
          kind: "working-tree",
          capturedAt: 1_700_002_020_000 + tag,
          diff,
          plaintextPayload: enc("public sol6 proto"),
          protection: new FakeProtectionPort(),
          store,
          sink,
          batchId: `batch:l4b-sol6-proto-${tag}`,
          generationId: `gen:${String(tag).padStart(10, "0")}`,
        }).then(
          () => null,
          (failure: unknown) => failure,
        );
        expect(error, `${key}/${via}`).toBeInstanceOf(SnapshotError);
        expect(new Set<string>(SNAPSHOT_ERROR_CODES as readonly string[]).has((error as SnapshotError).message), `${key}/${via}`).toBe(true);
        expect(sink.batches, `${key}/${via}`).toEqual([]);
        expect(store.stored, `${key}/${via}`).toEqual([]);
      }
    }
  });

  it("clé propre non énumérable ou DTO par ailleurs invalide : refus, rien au sink", async () => {
    let tag = 0;
    const cases: (() => LocalDiffDto)[] = [
      () => {
        const diff = sol6OpenDiff();
        const payload = (diff.files[0]?.hunks[0] as unknown as { payload: unknown }).payload as Record<string, unknown>;
        Object.defineProperty(payload, "__proto__", { value: { polluted: true }, enumerable: false, configurable: true, writable: true });
        return diff;
      },
      () => {
        const diff = sol6OpenDiff();
        const payload = (diff.files[0]?.hunks[0] as unknown as { payload: Record<string, unknown> }).payload;
        payload["reason"] = "not-a-known-reason";
        Object.defineProperty(payload, "__proto__", { value: 1, enumerable: true, configurable: true, writable: true });
        return diff;
      },
    ];
    for (const build of cases) {
      tag += 1;
      const store = new FakeLatestStore();
      const sink = new FakeSink();
      const error = await stageLocalSnapshot({
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        kind: "working-tree",
        capturedAt: 1_700_002_030_000 + tag,
        diff: build(),
        plaintextPayload: enc("public sol6 proto hidden"),
        protection: new FakeProtectionPort(),
        store,
        sink,
        batchId: `batch:l4b-sol6-proto-hidden-${tag}`,
        generationId: `gen:${String(tag).padStart(10, "0")}`,
      }).then(
        () => null,
        (failure: unknown) => failure,
      );
      expect(error, `cas ${tag}`).toBeInstanceOf(SnapshotError);
      expect(new Set<string>(SNAPSHOT_ERROR_CODES as readonly string[]).has((error as SnapshotError).message), `cas ${tag}`).toBe(true);
      expect(sink.batches, `cas ${tag}`).toEqual([]);
      expect(store.stored, `cas ${tag}`).toEqual([]);
    }
  });
});

// L4b-2 (rhanka/engram#368) — MAJEUR 1 Opus tour 7 : un secret détecté est
// exclu avec couverture explicite au lieu d'être scellé et conservé.
// Données SYNTHÉTIQUES uniquement (sondes P1/P2 de la revue).
// L4b-2 (rhanka/engram#368): red until fixed — owner split 2026-10-12
describe("L4b-2 secret exclusion", () => {
  it("a detected secret is excluded with explicit coverage instead of being sealed and retained", async () => {
    const secret = "AKIAIOSFODNN7SYNTHETIC";
    expect(containsSecretText(secret)).toBe(true);
    const derived = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
      hunkDrafts: [
        {
          path: enc("src/app.ts"),
          startBefore: 0,
          countBefore: 0,
          startAfter: 1,
          countAfter: 1,
          lines: ["ok"],
        },
      ],
    });
    // DTO direct : les lignes ouvertes portent le secret sans passer par la
    // politique de dérivation (sonde P2) ; la charge utile porte le même
    // secret en clair (sonde P1).
    const direct = JSON.parse(
      JSON.stringify(derived, (_key, node: unknown) =>
        node instanceof Uint8Array ? { $bytes: [...node] } : node,
      ),
      (_key, node: unknown) =>
        node !== null &&
        typeof node === "object" &&
        Array.isArray((node as { $bytes?: unknown }).$bytes)
          ? Uint8Array.from((node as { $bytes: number[] }).$bytes)
          : node,
    ) as unknown as LocalDiffDto;
    const mutable = direct as unknown as {
      files: { hunks: { payload: { state: string; lines: string[] } }[] }[];
    };
    for (const file of mutable.files) {
      for (const hunk of file.hunks) {
        if (hunk.payload.state === "open-lines") {
          hunk.payload.lines = [`const k = "${secret}";`];
        }
      }
    }
    const protection = new FakeProtectionPort();
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const staged = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_003_000_000,
      diff: direct,
      plaintextPayload: enc(`const k = "${secret}";`),
      protection,
      store,
      sink,
      batchId: "batch:l4b2-secret-excluded",
      generationId: "gen:0000000032",
    });
    // L4b-2 : aucun appel protect sur le secret, snapshot métadonnées
    // seulement, couverture indisponible explicite.
    expect(protection.protectCalls).toEqual([]);
    expect(staged.snapshot.sealed).toEqual({
      state: "metadata-only",
      reason: "metadata:policy-withheld",
    });
    expect(staged.coverage.state).toBe("unavailable");
    expect(staged.coverage.cause).toBe("policy-withheld");
    expect(staged.coverage.reason).toContain(CONTENT_UNAVAILABLE);
    const delivered = (sink.batches[0]?.facts[0] ?? null) as unknown as LocalDiffDto | null;
    expect(delivered?.files[0]?.hunks[0]?.payload.state).toBe("withheld");
    const leaked = scanValuesForLeak(
      [...collectStrings(store.stored), ...collectStrings(sink.batches)],
      [secret],
    );
    expect(leaked).toEqual([]);
  });
});

// L4b-2 (rhanka/engram#368) — variante paramétrée : chaque surface porteuse
// d'un secret détecté est exclue avant tout appel protect. Données
// SYNTHÉTIQUES uniquement.
describe("L4b-2 secret exclusion on every surface", () => {
  const SECRET = "AKIAIOSFODNN7SYNTHETIC";

  function cleanUnstagedDiff(withHunk: boolean): LocalDiffDto {
    return deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
      hunkDrafts: withHunk
        ? [
          {
            path: enc("src/app.ts"),
            startBefore: 1,
            countBefore: 1,
            startAfter: 1,
            countAfter: 1,
            lines: ["+clean line"],
          },
        ]
        : [],
    });
  }

  function openDiffWithSecretHunk(): LocalDiffDto {
    const derived = cleanUnstagedDiff(true);
    const direct = JSON.parse(
      JSON.stringify(derived, (_key, node: unknown) =>
        node instanceof Uint8Array ? { $bytes: [...node] } : node,
      ),
      (_key, node: unknown) =>
        node !== null &&
        typeof node === "object" &&
        Array.isArray((node as { $bytes?: unknown }).$bytes)
          ? Uint8Array.from((node as { $bytes: number[] }).$bytes)
          : node,
    ) as unknown as LocalDiffDto;
    const mutable = direct as unknown as {
      files: { hunks: { payload: { state: string; lines: string[] } }[] }[];
    };
    for (const file of mutable.files) {
      for (const hunk of file.hunks) {
        if (hunk.payload.state === "open-lines") {
          hunk.payload.lines = [`const k = "${SECRET}";`];
        }
      }
    }
    return direct;
  }

  it("hunk surface: secret open lines are withheld, zero protect calls", async () => {
    const protection = new FakeProtectionPort();
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const staged = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_003_010_000,
      diff: openDiffWithSecretHunk(),
      plaintextPayload: null,
      protection,
      store,
      sink,
      batchId: "batch:l4b2-surface-hunk",
      generationId: "gen:0000000040",
    });
    expect(protection.protectCalls).toEqual([]);
    const delivered = staged.batch.facts[0] as unknown as LocalDiffDto;
    expect(delivered.files[0]?.hunks[0]?.payload.state).toBe("withheld");
    expect(validateFactBatch(staged.batch).ok).toBe(true);
    expect(scanValuesForLeak(
      [...collectStrings(store.stored), ...collectStrings(sink.batches)],
      [SECRET],
    )).toEqual([]);
  });

  it("snapshot surface: secret payload is never transmitted, metadata-only policy-withheld", async () => {
    const protection = new FakeProtectionPort();
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const staged = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_003_011_000,
      diff: cleanUnstagedDiff(false),
      plaintextPayload: enc(`payload carries ${SECRET}`),
      protection,
      store,
      sink,
      batchId: "batch:l4b2-surface-snapshot",
      generationId: "gen:0000000041",
    });
    expect(protection.protectCalls).toEqual([]);
    expect(staged.snapshot.sealed).toEqual({ state: "metadata-only", reason: "metadata:policy-withheld" });
    expect(staged.coverage).toMatchObject({ state: "unavailable", cause: "policy-withheld" });
    expect(validateFactBatch(staged.batch).ok).toBe(true);
    expect(scanValuesForLeak(
      [...collectStrings(store.stored), ...collectStrings(sink.batches)],
      [SECRET],
    )).toEqual([]);
  });

  it("path surface: secret-bearing path becomes an opaque protected exclusion", async () => {
    const protection = new FakeProtectionPort();
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const direct = cleanUnstagedDiff(false);
    (direct.files[0] as unknown as { path: Uint8Array }).path = enc(`src/${SECRET}.ts`);
    const staged = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_003_012_000,
      diff: direct,
      plaintextPayload: null,
      protection,
      store,
      sink,
      batchId: "batch:l4b2-surface-path",
      generationId: "gen:0000000042",
    });
    expect(protection.protectCalls).toEqual([]);
    const delivered = staged.batch.facts[0] as unknown as LocalDiffDto;
    expect(delivered.files[0]?.exclusion).toBe("protected");
    expect(new TextDecoder().decode(delivered.files[0]!.path)).toMatch(/^withheld-path:[0-9a-f]{64}$/);
    expect(validateFactBatch(staged.batch).ok).toBe(true);
    expect(scanValuesForLeak(
      [...collectStrings(store.stored), ...collectStrings(sink.batches)],
      [SECRET],
    )).toEqual([]);
  });

  it("derived surfaces: patch, symbol, citation and context entries are removed with a count", () => {
    // Note: symbol, citation and context surfaces are not wired to any
    // protect call yet, so no protection assertion belongs here — the
    // screened result itself is the whole proof.
    const screened = screenBatchSurfaces({
      patchText: `clean\nconst k = "${SECRET}";`,
      symbolNames: ["add", SECRET],
      citationQuotes: [`quote of ${SECRET}`],
      searchSnippets: ["public snippet", `see ${SECRET}`],
      contextExcerpts: [SECRET, "public context"],
    });
    expect(screened.patchText).toBeNull();
    expect(screened.symbolNames).toEqual(["add"]);
    expect(screened.citationQuotes).toEqual([]);
    expect(screened.searchSnippets).toEqual(["public snippet"]);
    expect(screened.contextExcerpts).toEqual(["public context"]);
    expect(screened.removedEntries).toBe(5);
    expect(scanValuesForLeak(
      [screened.patchText ?? "", ...screened.symbolNames, ...screened.citationQuotes,
        ...screened.searchSnippets, ...screened.contextExcerpts],
      [SECRET],
    )).toEqual([]);
  });
});

// Opus tour 1 t1 + MAJEUR 2 — classe complète : chaque motif × chaque
// surface (hunk, charge, chemin courant, chemin précédent) × {clé, sans
// clé}. Données SYNTHÉTIQUES uniquement.
describe("L4b-2 secret matrix on every surface", () => {
  const CASES: { readonly rule: string; readonly token: string }[] = [
    { rule: "aws-access-key", token: "AKIAIOSFODNN7SYNTHETIC" },
    { rule: "github-token", token: "ghp_aaaaaaaaaaaaaaaaaaaa" },
    { rule: "private-key-block", token: "-----BEGIN PRIVATE KEY-----" },
    { rule: "credential-assignment", token: "password=synthetic-pw-not-real" },
    { rule: "credentialed-url", token: "https://user:synthpw@example.invalid/x" },
  ];

  function matrixDiff(withHunk: boolean): LocalDiffDto {
    return deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
      hunkDrafts: withHunk
        ? [
          {
            path: enc("src/app.ts"),
            startBefore: 1,
            countBefore: 1,
            startAfter: 1,
            countAfter: 1,
            lines: ["+clean line"],
          },
        ]
        : [],
    });
  }

  it("every matrix token carries a detected secret signal", () => {
    // La matrice couvre exactement les motifs de la politique, sans exemple isolé.
    expect(CASES.map(({ rule }) => rule).sort()).toEqual(
      SECRET_PATTERNS.map(({ id }) => id).sort(),
    );
    for (const { token } of CASES) {
      expect(containsSecretText(token)).toBe(true);
    }
  });

  const rows = CASES.flatMap(({ rule, token }) =>
    (["hunk", "payload", "path", "previousPath"] as const).flatMap((surface) =>
      [true, false].map((withKey) => ({ rule, token, surface, withKey })),
    ),
  );

  it.each(rows)(
    "rule $rule surface $surface withKey=$withKey excludes without protect call",
    async ({ rule, token, surface, withKey }) => {
      const protection = withKey ? new FakeProtectionPort() : null;
      const store = new FakeLatestStore();
      const sink = new FakeSink();
      const direct = matrixDiff(surface === "hunk" || surface === "previousPath");
      const mutable = direct as unknown as {
        files: {
          path: Uint8Array;
          previousPath: Uint8Array | null;
          hunks: { payload: { state: string; lines: string[] } }[];
        }[];
      };
      if (surface === "hunk") {
        for (const file of mutable.files) {
          for (const hunk of file.hunks) {
            if (hunk.payload.state === "open-lines") {
              hunk.payload.lines = [`carrier ${token} end`];
            }
          }
        }
      } else if (surface === "path") {
        mutable.files[0]!.path = enc(`src/${token}.ts`);
      } else if (surface === "previousPath") {
        mutable.files[0]!.previousPath = enc(`src/${token}.ts`);
      }
      const staged = await stageLocalSnapshot({
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        kind: "working-tree",
        capturedAt: 1_700_003_100_000,
        diff: direct,
        plaintextPayload: surface === "payload" ? enc(`payload ${token} end`) : null,
        protection,
        store,
        sink,
        batchId: `batch:l4b2-matrix-${rule}-${surface.toLowerCase()}-${withKey ? "key" : "nokey"}`,
        generationId: "gen:0000000043",
      });
      expect(protection?.protectCalls ?? []).toEqual([]);
      expect(validateFactBatch(staged.batch).ok).toBe(true);
      const delivered = staged.batch.facts[0] as unknown as LocalDiffDto;
      if (surface === "hunk") {
        expect(delivered.files[0]?.hunks[0]?.payload.state).toBe("withheld");
      } else if (surface === "payload") {
        expect(staged.snapshot.sealed).toEqual({ state: "metadata-only", reason: "metadata:policy-withheld" });
        expect(staged.coverage).toMatchObject({ state: "unavailable", cause: "policy-withheld" });
      } else {
        expect(delivered.files[0]?.exclusion).toBe("protected");
        expect(delivered.files[0]?.added).toBeNull();
        expect(delivered.files[0]?.deleted).toBeNull();
        expect(delivered.files[0]?.hunks).toEqual([]);
        expect(new TextDecoder().decode(delivered.files[0]!.path)).toMatch(/^withheld-path:[0-9a-f]{64}$/);
        if (surface === "previousPath") {
          expect(new TextDecoder().decode(delivered.files[0]!.previousPath!)).toMatch(/^withheld-path:[0-9a-f]{64}$/);
        }
      }
      expect(scanValuesForLeak(
        [...collectStrings(store.stored), ...collectStrings(sink.batches)],
        [token],
      )).toEqual([]);
    },
  );

  // MAJEUR 2 (sonde N4) : chemin courant, précédent, les deux — un chemin
  // précédent protégé scelle le contenu comme un chemin courant protégé.
  it.each(["current", "previous", "both"] as const)(
    "protected %s path excludes the whole file content",
    async (position) => {
      const protection = new FakeProtectionPort();
      const store = new FakeLatestStore();
      const sink = new FakeSink();
      const direct = matrixDiff(true);
      const file = (direct as unknown as {
        files: { path: Uint8Array; previousPath: Uint8Array | null }[];
      }).files[0]!;
      if (position === "current" || position === "both") file.path = enc(".env.production");
      if (position === "previous" || position === "both") file.previousPath = enc(".env.staging");
      const staged = await stageLocalSnapshot({
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        kind: "working-tree",
        capturedAt: 1_700_003_101_000,
        diff: direct,
        plaintextPayload: null,
        protection,
        store,
        sink,
        batchId: `batch:l4b2-prevpath-${position}`,
        generationId: "gen:0000000044",
      });
      expect(protection.protectCalls).toEqual([]);
      const delivered = staged.batch.facts[0] as unknown as LocalDiffDto;
      expect(delivered.files[0]?.exclusion).toBe("protected");
      expect(delivered.files[0]?.added).toBeNull();
      expect(delivered.files[0]?.deleted).toBeNull();
      expect(delivered.files[0]?.hunks).toEqual([]);
      expect(new TextDecoder().decode(delivered.files[0]!.path)).toMatch(/^withheld-path:[0-9a-f]{64}$/);
      if (position !== "current") {
        expect(new TextDecoder().decode(delivered.files[0]!.previousPath!)).toMatch(/^withheld-path:[0-9a-f]{64}$/);
      }
      expect(validateFactBatch(staged.batch).ok).toBe(true);
      expect(scanValuesForLeak(
        [...collectStrings(store.stored), ...collectStrings(sink.batches)],
        [".env.production", ".env.staging"],
      )).toEqual([]);
    },
  );
});

// L4b-2 m9 — generationId à largeur fixe : l'ordre lexicographique est
// l'ordre numérique (gen:...10 > gen:...09).
describe("L4b-2 m9 fixed-width generation order", () => {
  it("lexicographic order is numeric order and the format is enforced", async () => {
    expect(GENERATION_ID_WIDTH).toBe(10);
    expect(isStrictGenerationId("gen:0000000009")).toBe(true);
    expect(isStrictGenerationId("gen:0000000010")).toBe(true);
    expect("gen:0000000010" > "gen:0000000009").toBe(true);
    for (const bad of ["gen:10", "gen:9", "gen:abc", "batch:0000000001", "gen:000000009", "gen:00000000010"]) {
      expect(isStrictGenerationId(bad)).toBe(false);
    }
    const diff = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    });
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const error = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_003_020_000,
      diff,
      plaintextPayload: enc("public"),
      protection: new FakeProtectionPort(),
      store,
      sink,
      batchId: "batch:l4b2-m9-bad",
      generationId: "gen:10",
    }).then(() => null, (failure: unknown) => failure);
    expect(error).toBeInstanceOf(SnapshotError);
    expect((error as SnapshotError).code).toBe("invalid-generation-id");
    expect(sink.batches).toEqual([]);
    expect(store.stored).toEqual([]);
  });

  // t2 (Opus tour 1) : gen:…09 puis gen:…10 de bout en bout à travers le
  // moteur, vers un puits à rejet durable — l'ordre lexicographique porte
  // la succession, pas deux littéraux comparés. Données SYNTHÉTIQUES.
  it("successive gen:09 then gen:10 deliveries persist in order with durable rejection", async () => {
    class RejectingSink implements FactSinkPort {
      readonly batches: FactBatchDto[] = [];
      readonly holdings = new Map<string, FactBatchDto>();
      private targetOf(batch: FactBatchDto): string {
        const snapshot = batch.facts.find(
          (fact) => typeof (fact as { snapshotId?: unknown }).snapshotId === "string",
        ) as unknown as LocalSnapshotDto | undefined;
        return [
          batch.scope.tenant,
          batch.scope.clone,
          snapshot?.worktreeId ?? "",
          snapshot?.kind ?? "",
          snapshot?.diffKind ?? "",
        ].join("|");
      }
      async deliver(batch: FactBatchDto): Promise<FactSinkReceipt> {
        const target = this.targetOf(batch);
        const held = this.holdings.get(target);
        if (held !== undefined && batch.generationId <= held.generationId) {
          throw new Error("stale generation is durably rejected for its target");
        }
        this.batches.push(batch);
        this.holdings.set(target, batch);
        return { received: true, batchId: batch.batchId, retiredSuperseded: true, revokedDecryptability: true };
      }
    }
    const freshDiff = (): LocalDiffDto => deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    });
    const store = new FakeLatestStore();
    const sink = new RejectingSink();
    for (const [step, generationId] of [["09", "gen:0000000009"], ["10", "gen:0000000010"]] as const) {
      await stageLocalSnapshot({
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        kind: "working-tree",
        capturedAt: 1_700_003_021_000 + Number(step),
        diff: freshDiff(),
        plaintextPayload: enc(`public ${step}`),
        protection: new FakeProtectionPort(),
        store,
        sink,
        batchId: `batch:l4b2-m9-${step}`,
        generationId,
      });
    }
    expect(sink.batches.map((batch) => batch.generationId)).toEqual(["gen:0000000009", "gen:0000000010"]);
    const held = [...sink.holdings.values()];
    expect(held).toHaveLength(1);
    expect(held[0]?.generationId).toBe("gen:0000000010");
  });
});

// L4b-2 m1 — un accesseur de port qui jette ne propage jamais son texte :
// chaque lecture reste dans le try et devient un code constant.
describe("L4b-2 m1 throwing port accessors map to constant codes", () => {
  const throwing = (target: object, key: string): void => {
    Object.defineProperty(target, key, {
      get(): unknown {
        throw new Error("private port text must never surface");
      },
      enumerable: true,
      configurable: true,
    });
  };

  function openDiff(): LocalDiffDto {
    return deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [],
      tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
      hunkDrafts: [
        {
          path: enc("src/app.ts"),
          startBefore: 1,
          countBefore: 1,
          startAfter: 1,
          countAfter: 1,
          lines: ["+clean line"],
        },
      ],
    });
  }

  it("throwing hunk envelope and snapshot envelope refuse with constants", async () => {
    const hunkProtection: ContentProtectionPort = {
      protect: async (): Promise<SealedPayload> => {
        const envelope = {
          state: "sealed",
          algorithm: "fake-seal/1",
          keyRef: "fake-keyref-1",
          ciphertext: enc("sealed:12"),
        };
        throwing(envelope, "algorithm");
        return envelope as SealedPayload;
      },
    };
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const hunkError = await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_003_030_000, diff: openDiff(), plaintextPayload: null,
      protection: hunkProtection, store, sink,
      batchId: "batch:l4b2-m1-hunk", generationId: "gen:0000000050",
    }).then(() => null, (failure: unknown) => failure);
    expect(hunkError).toBeInstanceOf(SnapshotError);
    expect(SNAPSHOT_ERROR_CODES as readonly string[]).toContain((hunkError as SnapshotError).message);
    expect(sink.batches).toEqual([]);
    expect(store.stored).toEqual([]);

    const snapshotProtection: ContentProtectionPort = {
      protect: async (): Promise<SealedPayload> => {
        const envelope = {
          state: "sealed",
          algorithm: "fake-seal/1",
          keyRef: "fake-keyref-1",
          ciphertext: enc("sealed:7"),
        };
        throwing(envelope, "keyRef");
        return envelope as SealedPayload;
      },
    };
    const cleanDiff = deriveLocalDiff({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [], tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    });
    const storeB = new FakeLatestStore();
    const sinkB = new FakeSink();
    const snapshotError = await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_003_031_000, diff: cleanDiff, plaintextPayload: enc("public"),
      protection: snapshotProtection, store: storeB, sink: sinkB,
      batchId: "batch:l4b2-m1-snapshot", generationId: "gen:0000000051",
    }).then(() => null, (failure: unknown) => failure);
    expect(snapshotError).toBeInstanceOf(SnapshotError);
    expect(SNAPSHOT_ERROR_CODES as readonly string[]).toContain((snapshotError as SnapshotError).message);
    expect(sinkB.batches).toEqual([]);
  });

  it("throwing sink and store receipts refuse with constants", async () => {
    const cleanDiff = deriveLocalDiff({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [], tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    });
    class ThrowingSink implements FactSinkPort {
      readonly batches: FactBatchDto[] = [];
      async deliver(batch: FactBatchDto): Promise<FactSinkReceipt> {
        const receipt = {
          received: true as const,
          batchId: batch.batchId,
          retiredSuperseded: true,
          revokedDecryptability: true,
        };
        throwing(receipt, "batchId");
        return receipt;
      }
    }
    const sinkError = await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_003_032_000, diff: cleanDiff, plaintextPayload: null,
      protection: null, store: new FakeLatestStore(), sink: new ThrowingSink(),
      batchId: "batch:l4b2-m1-sink", generationId: "gen:0000000052",
    }).then(() => null, (failure: unknown) => failure);
    expect(sinkError).toBeInstanceOf(SnapshotError);
    expect((sinkError as SnapshotError).code).toBe("sink-delivery-refused");

    class ThrowingStore extends FakeLatestStore {
      override async replaceLatest(
        snapshot: LocalSnapshotDto, expected: string | null, generation: string,
      ): Promise<ReplaceLatestReceipt> {
        const receipt = await super.replaceLatest(snapshot, expected, generation);
        throwing(receipt, "retiredPrevious");
        return receipt;
      }
    }
    // Receipt fields are only read when a previous state exists: pre-stage
    // once so the second delivery exercises the throwing read.
    const throwingStore = new ThrowingStore();
    await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_003_033_000, diff: cleanDiff, plaintextPayload: null,
      protection: null, store: throwingStore, sink: new FakeSink(),
      batchId: "batch:l4b2-m1-store-pre", generationId: "gen:0000000053",
    });
    const storeError = await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_003_034_000, diff: cleanDiff, plaintextPayload: null,
      protection: null, store: throwingStore, sink: new FakeSink(),
      batchId: "batch:l4b2-m1-store", generationId: "gen:0000000054",
    }).then(() => null, (failure: unknown) => failure);
    expect(storeError).toBeInstanceOf(SnapshotError);
    expect((storeError as SnapshotError).code).toBe("store-conflict");
  });

  // m1-bis (Opus tour 1) : un accesseur jetant sur le previous du magasin
  // est lu dans le try et devient store-load-refused, sans texte du port.
  it("throwing previous accessor refuses with store-load-refused", async () => {
    const store = new FakeLatestStore();
    await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_003_035_000, diff: openDiff(), plaintextPayload: null,
      protection: null, store, sink: new FakeSink(),
      batchId: "batch:l4b2-m1-prev-pre", generationId: "gen:0000000055",
    });
    throwing(store.stored[0]!, "snapshotId");
    const error = await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_003_036_000, diff: openDiff(), plaintextPayload: null,
      protection: null, store, sink: new FakeSink(),
      batchId: "batch:l4b2-m1-prev", generationId: "gen:0000000056",
    }).then(() => null, (failure: unknown) => failure);
    expect(error).toBeInstanceOf(SnapshotError);
    expect((error as SnapshotError).code).toBe("store-load-refused");
    expect((error as SnapshotError).message).toBe("store-load-refused");
  });
});

// L4b-2 m2 — l'appelant qui réécrit son entrée pendant loadLatest ne
// détourne ni la cible ni la génération : tout est gelé avant le premier await.
describe("L4b-2 m2 entry fields frozen before suspension", () => {
  it("mutating generationId and kind across loadLatest changes nothing", async () => {
    const seen: { generationId: string }[] = [];
    const mutatingInput: {
      scope: LiveScope;
      worktreeId: string;
      kind: "working-tree" | "index";
      capturedAt: number;
      diff: LocalDiffDto;
      plaintextPayload: Uint8Array | null;
      protection: ContentProtectionPort | null;
      store: LatestSnapshotPort;
      sink: FactSinkPort;
      batchId: string;
      generationId: string;
    } = {
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "working-tree",
      capturedAt: 1_700_003_040_000,
      diff: deriveLocalDiff({
        scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
        base: { label: "index", oid: "b".repeat(40) },
        tip: { label: "worktree", oid: null },
        baseEntries: [], tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
      }),
      plaintextPayload: enc("public frozen"),
      protection: new FakeProtectionPort(),
      store: new FakeLatestStore(),
      sink: new FakeSink(),
      batchId: "batch:l4b2-m2-frozen",
      generationId: "gen:0000000060",
    };
    class MutatingStore extends FakeLatestStore {
      override async loadLatest(query: LatestSnapshotQuery): Promise<LocalSnapshotDto | null> {
        mutatingInput.generationId = "gen:0000000099";
        mutatingInput.kind = "index";
        mutatingInput.batchId = "batch:l4b2-m2-hijacked";
        return super.loadLatest(query);
      }
      override async replaceLatest(
        snapshot: LocalSnapshotDto, expected: string | null, generationId: string,
      ): Promise<ReplaceLatestReceipt> {
        seen.push({ generationId });
        return super.replaceLatest(snapshot, expected, generationId);
      }
    }
    mutatingInput.store = new MutatingStore();
    const staged = await stageLocalSnapshot(mutatingInput);
    expect(seen).toEqual([{ generationId: "gen:0000000060" }]);
    expect(staged.snapshot.kind).toBe("working-tree");
    expect(staged.snapshot.diffKind).toBe("unstaged");
    expect(staged.batch.batchId).toBe("batch:l4b2-m2-frozen");
    expect(staged.batch.generationId).toBe("gen:0000000060");
  });
});

// L4b-2 m3 — la révocation est copiée avant validation : un accesseur
// jetant devient une constante, une mutation ne traverse pas.
describe("L4b-2 m3 revocation copied before validation", () => {
  function validRevocation(): DeclarationRevocationDto {
    return {
      declarationId: "decl:l4b2-m3",
      tenant: SCOPE.tenant,
      cloneId: SCOPE.clone,
      worktreeId: WORKTREE_ID,
      declarationRevision: 1,
      reason: "workspace-remove",
      requestPrivatePurge: {
        purgePrivateSnapshots: true,
        purgeDerivedIndexes: true,
        revokeDecryptability: true,
        preserveCommittedHistory: true,
      },
    };
  }

  it("throwing worktreeId accessor refuses with a constant, nothing purged", async () => {
    const revocation = validRevocation() as Record<string, unknown>;
    Object.defineProperty(revocation, "worktreeId", {
      get(): unknown {
        throw new Error("private revocation text must never surface");
      },
      enumerable: true,
      configurable: true,
    });
    const store = new FakeLatestStore();
    const error = await runUnregisterPurge({
      revocation: revocation as unknown as DeclarationRevocationDto,
      store,
    }).then(() => null, (failure: unknown) => failure);
    expect(error).toBeInstanceOf(SnapshotError);
    expect(SNAPSHOT_ERROR_CODES as readonly string[]).toContain((error as SnapshotError).message);
    expect(store.purged).toBe(0);
    expect(store.purgeQueries).toEqual([]);
  });

  it("mutating the revocation across purgePrivate changes nothing downstream", async () => {
    const revocation = validRevocation();
    const queries: unknown[] = [];
    const store = new FakeLatestStore();
    const spying = new Proxy(store, {
      get(target, key, receiver): unknown {
        if (key === "purgePrivate") {
          return async (query: LatestSnapshotScope): Promise<PurgePrivateReceipt> => {
            (revocation as { worktreeId: string }).worktreeId = "wt:hijacked-during-purge";
            queries.push(JSON.parse(JSON.stringify(query)));
            return target.purgePrivate(query);
          };
        }
        return Reflect.get(target, key, receiver);
      },
    });
    const purged = await runUnregisterPurge({ revocation, store: spying });
    expect(purged.purgedPrivate).toBe(true);
    expect(queries).toEqual([
      {
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        declarationId: "decl:l4b2-m3",
        declarationRevision: 1,
      },
    ]);
  });
});

// L4b-2 m4 — le previous du magasin est validé puis copié : un état
// malformé est refusé, l'objet rendu n'est jamais l'objet du magasin.
describe("L4b-2 m4 previous state validated and copied", () => {
  const PRIVATE_TEXT = "private previous text must never surface";

  function cleanDiff(): LocalDiffDto {
    return deriveLocalDiff({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [], tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
    });
  }

  it("malformed previous is refused before any diagnostic copies it", async () => {
    class LyingStore extends FakeLatestStore {
      override async loadLatest(): Promise<LocalSnapshotDto | null> {
        return { snapshotId: PRIVATE_TEXT } as unknown as LocalSnapshotDto;
      }
    }
    const store = new LyingStore();
    const sink = new FakeSink();
    const error = await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_003_050_000, diff: cleanDiff(), plaintextPayload: null,
      protection: null, store, sink,
      batchId: "batch:l4b2-m4-lying", generationId: "gen:0000000070",
    }).then(() => null, (failure: unknown) => failure);
    expect(error).toBeInstanceOf(SnapshotError);
    expect((error as SnapshotError).code).toBe("store-load-refused");
    expect(sink.batches).toEqual([]);
    const message = error instanceof Error ? error.message : String(error);
    expect(scanValuesForLeak([message], [PRIVATE_TEXT])).toEqual([]);
  });

  it("returned snapshot shares no reference with the store", async () => {
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_003_051_000, diff: cleanDiff(), plaintextPayload: null,
      protection: null, store, sink,
      batchId: "batch:l4b2-m4-a", generationId: "gen:0000000071",
    });
    // Unstable capture: the preserved previous state is returned without a
    // store write — the exact aliasing case. Mutating it must not touch
    // the store.
    const unstable = deriveLocalDiff({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [], tipEntries: [],
      stable: false,
      unstableReason: "capture loop raced an index rewrite",
    });
    const preserved = await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_003_052_000, diff: unstable, plaintextPayload: null,
      protection: null, store, sink,
      batchId: "batch:l4b2-m4-b", generationId: "gen:0000000072",
    });
    const before = JSON.parse(JSON.stringify(store.stored)) as unknown;
    (preserved.snapshot as unknown as Record<string, unknown>)["capturedAt"] = -1;
    expect(store.stored).toEqual(before);
  });
});

// L4b-2 m5 — le chiffré admis ne fait jamais faux positif : un scellé dont
// les octets ressemblent à un secret ou à un chemin protégé passe la porte.
describe("L4b-2 m5 admitted ciphertext never false-positives", () => {
  it("secret-looking seal bytes are delivered, not refused", async () => {
    const evil = new TextEncoder().encode("cipher pwd=s3cret\x00tail /x.pem");
    const protection: ContentProtectionPort = {
      protect: async (): Promise<SealedPayload> => ({
        state: "sealed",
        algorithm: "fake-seal/1",
        keyRef: "fake-keyref-1",
        ciphertext: evil,
      }),
    };
    const diff = deriveLocalDiff({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
      base: { label: "index", oid: "b".repeat(40) },
      tip: { label: "worktree", oid: null },
      baseEntries: [], tipEntries: [entryLike("src/app.ts", "d".repeat(40))],
      hunkDrafts: [
        {
          path: enc("src/app.ts"),
          startBefore: 1, countBefore: 1, startAfter: 1, countAfter: 1,
          lines: ["+clean line"],
        },
      ],
    });
    const store = new FakeLatestStore();
    const sink = new FakeSink();
    const staged = await stageLocalSnapshot({
      scope: SCOPE, worktreeId: WORKTREE_ID, kind: "working-tree",
      capturedAt: 1_700_003_060_000, diff, plaintextPayload: enc("public"),
      protection, store, sink,
      batchId: "batch:l4b2-m5-evil", generationId: "gen:0000000080",
    });
    expect(sink.batches).toHaveLength(1);
    expect(validateFactBatch(staged.batch).ok).toBe(true);
  });
});
