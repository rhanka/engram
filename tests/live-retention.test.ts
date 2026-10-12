// R1 — Private Retention Of All Ingested Roots, siège engram (PARTIE E: UNIQUEMENT)
// (plan/09 R1 ; spec/SPEC_LIVE_GIT_INDEXING.md §4, A02/A04).
//
// Test-first : ce fichier est écrit avant engram-live/retention.ts et avant
// les DTOs R1 de engram-live/contracts.ts ; il doit être observé ROUGE.
// La partie H: (live-object-store, delegate) appartient à h-cond : engram
// définit seulement le contrat/port neutre consommé par h2a, sans l'implémenter.
// Rétention privée, sans limite de nombre ni d'âge, rien n'est effacé.

import { realpathSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCorpus,
  detectGitCapabilities,
  LiveGitSandbox,
} from "./helpers/live-git-fixtures.js";
import {
  validateQualifiedOid,
  validateRetentionReceipt,
  validateRetentionRequest,
  type LiveScope,
  type QualifiedOid,
  type RawRefObservationDto,
  type RetainedRootDto,
  type RetentionReceiptDto,
  type RetentionRequestDto,
  type RootSelectionSignal,
  type SelectedRootDto,
} from "../engram-live/contracts.js";
import { selectHistoryRoots, trackRef } from "../engram-live/refs.js";
import { observeRepository } from "../engram-live/repository.js";
import {
  deriveRetentionRequests,
  runRetentionPass,
  type RetentionPort,
} from "../engram-live/retention.js";

const DAY = 86_400_000;
const FIXTURE_TIME = 1_700_000_000_000;

const sandboxes: LiveGitSandbox[] = [];
function sandbox(): LiveGitSandbox {
  const value = new LiveGitSandbox();
  sandboxes.push(value);
  return value;
}
afterEach(() => {
  for (const value of sandboxes.splice(0)) value.dispose();
});

// Port factice : mémoire seule, jamais une base. Les reçus sont durables
// (ils survivent aux passes) et cloisonnés par portée (tenant + clone).
class MemoryRetentionPort implements RetentionPort {
  readonly requests = new Map<string, RetentionRequestDto>();
  readonly receipts = new Map<string, RetentionReceiptDto>();
  private readonly key = (scope: LiveScope, oid: string): string => `${scope.tenant}:${scope.clone}:${oid}`;

  async recordRequest(request: RetentionRequestDto): Promise<{ received: true }> {
    this.requests.set(this.key(request.scope, request.oid), request);
    return { received: true };
  }

  async recordReceipt(receipt: RetentionReceiptDto): Promise<{ received: true }> {
    const checked = validateRetentionReceipt(receipt);
    if (!checked.ok) throw new Error(`invalid receipt: ${checked.errors.join("; ")}`);
    this.receipts.set(this.key(receipt.scope, receipt.oid), receipt);
    return { received: true };
  }

  async loadReceipts(query: { scope: LiveScope; algorithm: QualifiedOid["algorithm"] }): Promise<{ receipts: RetentionReceiptDto[] }> {
    return {
      receipts: [...this.receipts.values()].filter(
        (receipt) => receipt.scope.tenant === query.scope.tenant
          && receipt.scope.clone === query.scope.clone
          && receipt.algorithm === query.algorithm,
      ),
    };
  }
}

function observeRefs(box: LiveGitSandbox, repo: string, observedAt: number): RawRefObservationDto[] {
  const out = box.git(repo, [
    "for-each-ref", "--sort=refname",
    "--format=%(refname)%00%(objectname)%00%(committerdate:unix)",
  ], undefined, "oracle").toString();
  const observations: RawRefObservationDto[] = [];
  for (const line of out.trim().split("\n")) {
    if (line === "") continue;
    const [refName, oid, committerUnix] = line.split("\0");
    observations.push({
      refName: refName!,
      oid: oid!,
      observedAt,
      ...(committerUnix !== undefined && committerUnix !== "" ? { tipCommitterUnixSeconds: Number(committerUnix) } : {}),
    });
  }
  return observations;
}

describe("live-retention", () => {
  it("every local remote-known PR and detached root requires a scoped durable retention receipt", async () => {
    const box = sandbox();
    const capabilities = detectGitCapabilities(box);
    const format = capabilities.objectFormats.includes("sha1") ? "sha1" as const : capabilities.objectFormats[0]!;
    const corpus = buildCorpus(box, format, "files");
    const commonDir = realpathSync(join(corpus.repo, ".git"));
    const repository = observeRepository({
      hostScope: "r1-test-host",
      commonDirRealpath: commonDir,
      commonDirProjectFingerprint: "ws:r1-corpus",
      oidAlgorithm: format,
      worktrees: [
        { worktreePath: corpus.repo, gitDir: box.git(corpus.repo, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim(), worktreeFingerprint: "wtfp:main", head: { kind: "branch", refName: "refs/heads/main" } },
        { worktreePath: corpus.detached, gitDir: box.git(corpus.detached, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim(), worktreeFingerprint: "wtfp:detached", head: { kind: "detached", oid: corpus.commits.merge } },
      ],
    });
    const scope: LiveScope = { tenant: "local:r1-owner", clone: repository.clone.cloneId };
    const now = FIXTURE_TIME + 5 * DAY;
    const raw = observeRefs(box, corpus.repo, now);
    const byRef = new Map<string, RawRefObservationDto[]>();
    for (const observation of raw) {
      const list = byRef.get(observation.refName) ?? [];
      list.push(observation);
      byRef.set(observation.refName, list);
    }
    const tracked = [...byRef.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([refName, list]) => trackRef(refName, list));
    const roots = selectHistoryRoots({
      trackedRefs: tracked,
      worktreeHeads: [
        { worktreeId: repository.worktrees[0]!.identity.worktreeId, head: { kind: "branch", refName: "refs/heads/main" } },
        { worktreeId: repository.worktrees[1]!.identity.worktreeId, head: { kind: "detached", oid: corpus.commits.merge } },
      ],
      defaultBranch: "refs/heads/main",
      retainedRoots: [],
      now,
      oidAlgorithm: format,
    });
    // Le corpus porte du local, du remote connu, des PR tous états et un
    // détaché : chaque famille doit exiger une rétention.
    const signals = new Set<RootSelectionSignal>();
    for (const root of roots) for (const source of root.sources) signals.add(source.signal);
    expect(signals.has("default-branch")).toBe(true);
    expect(signals.has("active-window")).toBe(true);
    expect(signals.has("pr-head")).toBe(true);
    expect(signals.has("worktree-head")).toBe(true);

    // Aucune limite de nombre ni d'âge : une requête par racine distincte,
    // y compris la branche par défaut quand elle est vieille.
    const oldNow = FIXTURE_TIME + 100 * DAY;
    const oldRoots = selectHistoryRoots({
      trackedRefs: tracked,
      worktreeHeads: [
        { worktreeId: repository.worktrees[0]!.identity.worktreeId, head: { kind: "branch", refName: "refs/heads/main" } },
        { worktreeId: repository.worktrees[1]!.identity.worktreeId, head: { kind: "detached", oid: corpus.commits.merge } },
      ],
      defaultBranch: "refs/heads/main",
      retainedRoots: roots.map((root): RetainedRootDto => ({
        cloneId: repository.clone.cloneId,
        algorithm: format,
        oid: root.qualifiedOid.oid,
        firstSeenAt: now,
        firstSignal: root.sources[0]!.signal,
        refName: root.sources.find((source) => source.refName !== null)?.refName ?? null,
      })),
      now: oldNow,
      oidAlgorithm: format,
    });
    const requests = deriveRetentionRequests(roots, scope, now);
    expect(requests.length).toBe(new Set(roots.map((root) => root.qualifiedOid.oid)).size);
    expect(requests.length).toBeGreaterThan(0);
    const oldRequests = deriveRetentionRequests(oldRoots, scope, oldNow);
    expect(oldRequests.length).toBe(new Set(oldRoots.map((root) => root.qualifiedOid.oid)).size);
    // La vieille branche par défaut reste demandée : l'âge ne supprime rien.
    expect(oldRequests.length).toBeGreaterThan(0);

    // Chaque requête est cadrée (tenant + clone), qualifiée par algorithme,
    // validée, et ne porte aucun plaintext non validé : seuls des OIDs
    // validés, jamais du contenu.
    const oids = new Set(roots.map((root) => root.qualifiedOid.oid));
    for (const request of requests) {
      expect(validateRetentionRequest(request).ok).toBe(true);
      expect(request.scope).toEqual(scope);
      expect(oids.has(request.oid)).toBe(true);
      expect(validateQualifiedOid({ algorithm: request.algorithm, oid: request.oid }).ok).toBe(true);
      expect(request).not.toHaveProperty("content");
      expect(request).not.toHaveProperty("plaintext");
      expect(request).not.toHaveProperty("patch");
    }
    // Un plaintext glissé dans une requête est refusé, pas conservé.
    const tampered = { ...requests[0]!, content: "FIXTURE_SECRET=protected" };
    expect(validateRetentionRequest(tampered).ok).toBe(false);

    // Sans reçu durable, chaque racine est un manque explicite, jamais un succès.
    const port = new MemoryRetentionPort();
    const pending = await runRetentionPass({ roots, scope, now }, port);
    expect(pending.state).toBe("gaps");
    expect(pending.coverage).toEqual([{
      axis: "object-availability",
      state: "unavailable",
      reason: expect.stringContaining("retention"),
      cause: "missing-receipt",
      missing: expect.arrayContaining([...oids].map((oid) => ({ algorithm: format, oid })).slice(0, 1)),
    }]);
    expect(pending.stats.requests).toBe(requests.length);
    expect(pending.stats.receipts).toBe(0);

    // Un reçu d'une autre portée ne satisfait rien (tenant, puis clone).
    await port.recordReceipt({
      scope: { tenant: "local:other-tenant", clone: scope.clone },
      algorithm: format,
      oid: requests[0]!.oid,
      receivedAt: now,
      backupRef: `backup:${format}:${requests[0]!.oid.slice(0, 12)}`,
    });
    await port.recordReceipt({
      scope: { tenant: scope.tenant, clone: "clone:other-clone" },
      algorithm: format,
      oid: requests[0]!.oid,
      receivedAt: now,
      backupRef: `backup:${format}:${requests[0]!.oid.slice(0, 12)}`,
    });
    const foreign = await runRetentionPass({ roots, scope, now }, port);
    expect(foreign.state).toBe("gaps");

    // Reçus durables cadrés pour chaque racine : couverture complète, avec
    // références de sauvegarde coordonnées exposées pour L8.
    for (const request of requests) {
      await port.recordReceipt({
        scope,
        algorithm: request.algorithm,
        oid: request.oid,
        receivedAt: now,
        backupRef: `backup:${request.algorithm}:${request.oid.slice(0, 12)}`,
      });
    }
    const covered = await runRetentionPass({ roots, scope, now }, port);
    expect(covered.state).toBe("complete");
    expect(covered.coverage).toEqual([]);
    expect(covered.stats.requests).toBe(requests.length);
    expect(covered.stats.receipts).toBe(requests.length);
    const loaded = await port.loadReceipts({ scope, algorithm: format });
    expect(loaded.receipts.length).toBe(requests.length);
    for (const receipt of loaded.receipts) {
      expect(validateRetentionReceipt(receipt).ok).toBe(true);
      expect(typeof receipt.backupRef).toBe("string");
      expect(receipt.backupRef.length).toBeGreaterThan(0);
    }

    // Racine supprimée ensuite : elle reste interrogeable par sa requête et
    // son reçu durables, indépendamment de l'atteignabilité courante (L2b).
    box.git(corpus.repo, ["update-ref", "-d", "refs/heads/topic"]);
    const afterNow = now + DAY;
    const afterRaw = observeRefs(box, corpus.repo, afterNow);
    const afterByRef = new Map<string, RawRefObservationDto[]>();
    for (const observation of [...raw, ...afterRaw.map((observation): RawRefObservationDto => observation)]) {
      const list = afterByRef.get(observation.refName) ?? [];
      list.push(observation);
      afterByRef.set(observation.refName, list);
    }
    afterByRef.set("refs/heads/topic", [
      ...(afterByRef.get("refs/heads/topic") ?? []),
      { refName: "refs/heads/topic", oid: "", absent: true, observedAt: afterNow },
    ]);
    const afterTracked = [...afterByRef.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([refName, list]) => trackRef(refName, list));
    const retained: RetainedRootDto[] = requests.map((request): RetainedRootDto => ({
      cloneId: scope.clone,
      algorithm: request.algorithm,
      oid: request.oid,
      firstSeenAt: now,
      firstSignal: "previously-ingested",
      refName: null,
    }));
    const afterRoots: readonly SelectedRootDto[] = selectHistoryRoots({
      trackedRefs: afterTracked,
      worktreeHeads: [
        { worktreeId: repository.worktrees[0]!.identity.worktreeId, head: { kind: "branch", refName: "refs/heads/main" } },
        { worktreeId: repository.worktrees[1]!.identity.worktreeId, head: { kind: "detached", oid: corpus.commits.merge } },
      ],
      defaultBranch: "refs/heads/main",
      retainedRoots: retained,
      now: afterNow,
      oidAlgorithm: format,
    });
    // Rien n'est effacé : la racine supprimée reste demandée et couverte.
    for (const oid of oids) {
      expect(new Set(afterRoots.map((root) => root.qualifiedOid.oid)).has(oid)).toBe(true);
    }
    const after = await runRetentionPass({ roots: afterRoots, scope, now: afterNow }, port);
    expect(after.state).toBe("complete");
    expect(after.coverage).toEqual([]);
  }, 120_000);
});

describe("live-retention scope snapshot (REVIEW-R1-sol MAJEUR)", () => {
  const OID = "0123456789abcdef0123456789abcdef01234567";

  function onePrRoot(): SelectedRootDto[] {
    return [{
      qualifiedOid: { algorithm: "sha1", oid: OID },
      rev: OID,
      sources: [{
        signal: "pr-head",
        refName: "refs/pull/42/head",
        worktreeId: null,
        activityAt: null,
        generation: null,
      }],
    }];
  }

  // Port dont le premier recordRequest fait muter l'objet de portée partagé
  // pendant l'await (concurrence hôte), puis ne sert qu'un reçu de la
  // portée mutée. Aucune mutation des paramètres du port, aucune conversion.
  class ScopeSwitchPort implements RetentionPort {
    readonly recorded: RetentionRequestDto[] = [];

    constructor(
      private readonly onFirstRequest: () => void,
      private readonly receiptScope: LiveScope,
    ) {}

    async recordRequest(request: RetentionRequestDto): Promise<{ received: true }> {
      if (this.recorded.length === 0) this.onFirstRequest();
      this.recorded.push(request);
      return { received: true };
    }

    async recordReceipt(): Promise<{ received: true }> {
      return { received: true };
    }

    async loadReceipts(): Promise<{ receipts: RetentionReceiptDto[] }> {
      return {
        receipts: [{
          scope: { tenant: this.receiptScope.tenant, clone: this.receiptScope.clone },
          algorithm: "sha1",
          oid: OID,
          receivedAt: FIXTURE_TIME,
          backupRef: `backup:sha1:${OID.slice(0, 12)}`,
        }],
      };
    }
  }

  it("tenant A→B pendant recordRequest, reçu B seul : gaps avec racine manquante", async () => {
    const backing = { tenant: "local:tenant-a", clone: "clone:a" };
    const scope: LiveScope = backing;
    const port = new ScopeSwitchPort(
      () => { backing.tenant = "local:tenant-b"; },
      { tenant: "local:tenant-b", clone: "clone:a" },
    );
    const outcome = await runRetentionPass({ roots: onePrRoot(), scope, now: FIXTURE_TIME }, port);
    expect(port.recorded).toHaveLength(1);
    expect(port.recorded[0]!.scope).toEqual({ tenant: "local:tenant-a", clone: "clone:a" });
    expect(outcome.state).toBe("gaps");
    expect(outcome.stats).toEqual({ requests: 1, receipts: 0, missing: 1 });
    expect(outcome.coverage).toHaveLength(1);
    expect(outcome.coverage[0]!.missing).toEqual([{ algorithm: "sha1", oid: OID }]);
  });

  it("clone A→B pendant recordRequest, reçu B seul : gaps avec racine manquante", async () => {
    const backing = { tenant: "local:tenant-a", clone: "clone:a" };
    const scope: LiveScope = backing;
    const port = new ScopeSwitchPort(
      () => { backing.clone = "clone:b"; },
      { tenant: "local:tenant-a", clone: "clone:b" },
    );
    const outcome = await runRetentionPass({ roots: onePrRoot(), scope, now: FIXTURE_TIME }, port);
    expect(port.recorded).toHaveLength(1);
    expect(port.recorded[0]!.scope).toEqual({ tenant: "local:tenant-a", clone: "clone:a" });
    expect(outcome.state).toBe("gaps");
    expect(outcome.stats).toEqual({ requests: 1, receipts: 0, missing: 1 });
    expect(outcome.coverage).toHaveLength(1);
    expect(outcome.coverage[0]!.missing).toEqual([{ algorithm: "sha1", oid: OID }]);
  });
});
