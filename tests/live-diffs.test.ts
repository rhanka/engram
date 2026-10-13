// L4b — Diffs And Encrypted Latest Local Content, siège engram (PARTIE E: UNIQUEMENT)
// (plan/09 L4b ; spec/SPEC_LIVE_GIT_INDEXING.md §§8, 10, A08/A09).
//
// Test-first : ce fichier est écrit avant engram-live/diffs.ts et avant les
// DTOs L4b de engram-live/contracts.ts ; il doit être observé ROUGE.
// Les RED S: (cluster-mesh, SQLite réel) et H: (h2a, fournisseur de clés)
// appartiennent à sentropic et h-cond : engram définit seulement les ports
// neutres (protection de contenu injectée, fournisseur de clés, demande de
// purge), exercés ici avec des faux ports, sans les implémenter.
// Décision owner Q2 B : seul le dernier état local autorisé est conservé.
//
// Exigences E: (A08) : staged / unstaged / étapes de conflit restent
// distinctes avec bornes immuables ; binaires, gros fichiers, chemins
// filtrés, liens symboliques et captures instables → exclusions explicites
// ou couverture explicite. Aucun import h2a/cluster-mesh/sentropic,
// aucune base, aucun réseau.

import { describe, expect, it } from "vitest";
import {
  CONTENT_POLICY_VERSION,
  LOCAL_DIFF_NORMALIZER_VERSION,
  validateLocalDiff,
  type LiveScope,
  type LocalDiffDto,
  type LocalDiffEndpointDto,
} from "../engram-live/contracts.js";
import {
  deriveLocalDiff,
  type DeriveLocalDiffInput,
  type LocalEntryInput,
} from "../engram-live/diffs.js";
import {
  stageLocalSnapshot,
  type FactSinkPort,
  type FactSinkReceipt,
  type LatestSnapshotPort,
  type LatestSnapshotQuery,
  type LatestSnapshotScope,
  type PurgePrivateReceipt,
  type ReplaceLatestReceipt,
} from "../engram-live/snapshots.js";
import type { FactBatchDto, LocalSnapshotDto } from "../engram-live/contracts.js";

const SCOPE: LiveScope = { tenant: "local:test-owner", clone: "clone:l4b-diffs" };
const WORKTREE_ID = "wt:l4b-diffs-main";

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const hex = (bytes: Uint8Array): string =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

function entry(path: string, oid: string, overrides?: Partial<LocalEntryInput>): LocalEntryInput {
  return {
    path: enc(path),
    mode: "100644",
    oid,
    stage: 0,
    kind: "file",
    size: 120,
    isBinary: false,
    ...overrides,
  };
}

const HEAD_ENDPOINT: LocalDiffEndpointDto = {
  label: "HEAD",
  oid: "a".repeat(40),
};
const INDEX_ENDPOINT: LocalDiffEndpointDto = {
  label: "index",
  oid: "b".repeat(40),
};
const WORKTREE_ENDPOINT: LocalDiffEndpointDto = {
  label: "worktree",
  oid: null,
};

function stagedInput(): DeriveLocalDiffInput {
  return {
    scope: SCOPE,
    worktreeId: WORKTREE_ID,
    kind: "staged",
    base: HEAD_ENDPOINT,
    tip: INDEX_ENDPOINT,
    baseEntries: [entry("src/app.ts", "c".repeat(40))],
    tipEntries: [
      entry("src/app.ts", "d".repeat(40)),
      entry("src/new.ts", "e".repeat(40)),
    ],
  };
}

describe("live diffs", () => {
  it("staged unstaged and conflict-stage changes remain distinct with immutable endpoints", () => {
    const staged = deriveLocalDiff(stagedInput());
    const unstaged = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: INDEX_ENDPOINT,
      tip: WORKTREE_ENDPOINT,
      baseEntries: [entry("src/app.ts", "d".repeat(40))],
      tipEntries: [entry("src/app.ts", "f".repeat(40))],
    });
    const conflict = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: INDEX_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [],
      tipEntries: [],
      conflictStages: [
        { path: enc("src/clash.ts"), baseOid: "1".repeat(40), oursOid: "2".repeat(40), theirsOid: "3".repeat(40) },
      ],
    });

    // Distinct kinds and distinct endpoint pairs.
    expect(staged.kind).toBe("staged");
    expect(unstaged.kind).toBe("unstaged");
    expect(conflict.kind).toBe("conflict");
    expect([staged.base.label, staged.tip.label]).toEqual(["HEAD", "index"]);
    expect([unstaged.base.label, unstaged.tip.label]).toEqual(["index", "worktree"]);
    expect(conflict.base).toEqual(conflict.tip);
    expect(conflict.base.label).toBe("index");

    // Conflict stages 1/2/3 stay separate facts, never merged into one blob.
    expect(conflict.files).toHaveLength(1);
    expect(conflict.files[0]?.stageOids).toEqual({
      "1": "1".repeat(40),
      "2": "2".repeat(40),
      "3": "3".repeat(40),
    });

    // Staged and unstaged changes to the same path are two facts, not one.
    expect(staged.files.map((f) => hex(f.path))).toContain(
      Array.from(enc("src/app.ts")).map((b) => b.toString(16).padStart(2, "0")).join(""),
    );

    // Immutable endpoints: mutating the caller inputs after derivation
    // changes nothing in the derived DTOs.
    const frozen: LocalDiffDto = deriveLocalDiff(stagedInput());
    const before = JSON.stringify({ base: frozen.base, tip: frozen.tip, files: frozen.files.length });
    expect(frozen.normalizerVersion).toBe(LOCAL_DIFF_NORMALIZER_VERSION);
    expect(frozen.policyVersion).toBe(CONTENT_POLICY_VERSION);
    expect(validateLocalDiff(frozen).ok).toBe(true);
    expect(before).toBe(JSON.stringify({ base: staged.base, tip: staged.tip, files: staged.files.length }));

    // A staged endpoint can never be relabelled as unstaged after the fact.
    expect(staged.base).toEqual(HEAD_ENDPOINT);
    expect(unstaged.base).toEqual(INDEX_ENDPOINT);

    // Hunk drafts carry immutable ranges; secret lines are withheld at
    // derivation (policy before persistence), allowed lines stay transient.
    const ranged = deriveLocalDiff({
      ...stagedInput(),
      tipEntries: [entry("src/app.ts", "d".repeat(40))],
      hunkDrafts: [
        {
          path: enc("src/app.ts"),
          startBefore: 1,
          countBefore: 3,
          startAfter: 1,
          countAfter: 4,
          lines: [" context", "+added line"],
        },
        {
          path: enc("src/app.ts"),
          startBefore: 10,
          countBefore: 1,
          startAfter: 11,
          countAfter: 1,
          lines: ["token ghp_synthetic0123456789abcdefghijEXAMPLE"],
        },
      ],
    });
    expect(ranged.files).toHaveLength(1);
    expect(ranged.files[0]?.hunks).toHaveLength(2);
    expect(ranged.files[0]?.hunks[0]).toMatchObject({
      startBefore: 1,
      countBefore: 3,
      startAfter: 1,
      countAfter: 4,
      payload: { state: "open-lines", lines: [" context", "+added line"] },
    });
    expect(ranged.files[0]?.hunks[1]?.payload.state).toBe("withheld");
    expect(validateLocalDiff(ranged).ok).toBe(true);
  });

  it("binaries large files filtered paths symlinks and unstable captures report explicit exclusions or coverage", () => {
    const diff = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: INDEX_ENDPOINT,
      tip: WORKTREE_ENDPOINT,
      baseEntries: [],
      tipEntries: [
        entry("assets/logo.png", "1".repeat(40), { isBinary: true, size: 2048 }),
        entry("data/dump.bin", "2".repeat(40), { isBinary: true, size: 9_999_999 }),
        entry("build/huge.txt", "3".repeat(40), { size: 8 * 1024 * 1024 }),
        entry("src/app.ts", "4".repeat(40), { filtered: true }),
        entry("link-out", "5".repeat(40), { kind: "symlink", linkTarget: enc("../outside/secret.txt") }),
        entry("vendor/sub", "6".repeat(40), { kind: "gitlink" }),
      ],
    });

    const byPath = new Map(diff.files.map((f) => [new TextDecoder().decode(f.path), f]));
    expect(byPath.get("assets/logo.png")?.exclusion).toBe("binary");
    expect(byPath.get("data/dump.bin")?.exclusion).toBe("binary");
    expect(byPath.get("build/huge.txt")?.exclusion).toBe("oversized");
    expect(byPath.get("src/app.ts")?.exclusion).toBe("filtered");
    expect(byPath.get("link-out")?.exclusion).toBe("symlink");
    expect(byPath.get("vendor/sub")?.exclusion).toBe("gitlink");
    // Excluded files carry metadata only: no invented text hunks.
    for (const file of diff.files) {
      expect(file.exclusion).toBeDefined();
      expect(file.hunks ?? []).toEqual([]);
      expect(file.added).toBeNull();
      expect(file.deleted).toBeNull();
    }

    // An unstable capture publishes no file facts at all: explicit coverage.
    const unstable = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "unstaged",
      base: INDEX_ENDPOINT,
      tip: WORKTREE_ENDPOINT,
      baseEntries: [],
      tipEntries: [entry("src/app.ts", "4".repeat(40))],
      stable: false,
      unstableReason: "attributes changed during the capture loop",
    });
    expect(unstable.files).toEqual([]);
    expect(unstable.coverage).toBeDefined();
    expect(unstable.coverage?.state).not.toBe("current");
    expect(unstable.coverage?.cause).toBe("unstable-capture");
  });

  it("review M5: every bound and every conflict step carries its required exclusion", () => {
    // Conflict branch: binary, filtered and oversized signals from the
    // inventories must exclude the conflicted path instead of yielding a
    // bare hunk.
    const clash = "1".repeat(40);
    const conflicted = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: INDEX_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [
        entry("src/clash.ts", clash, { isBinary: true, filtered: true, size: 9_999_999 }),
      ],
      tipEntries: [
        entry("src/clash.ts", clash, { isBinary: true, filtered: true, size: 9_999_999 }),
      ],
      conflictStages: [
        { path: enc("src/clash.ts"), baseOid: "1".repeat(40), oursOid: "2".repeat(40), theirsOid: "3".repeat(40) },
      ],
      hunkDrafts: [
        {
          path: enc("src/clash.ts"),
          startBefore: 1,
          countBefore: 1,
          startAfter: 1,
          countAfter: 1,
          lines: [" conflict body"],
        },
      ],
    });
    expect(conflicted.files).toHaveLength(1);
    expect(conflicted.files[0]?.exclusion).toBeDefined();
    expect(conflicted.files[0]?.hunks ?? []).toEqual([]);

    // Off-conflict branch: a filtered old bound must exclude the file even
    // when the new bound looks allowed, so removed lines never leak.
    const filteredOld = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: HEAD_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [entry("src/app.ts", "c".repeat(40), { filtered: true })],
      tipEntries: [entry("src/app.ts", "d".repeat(40))],
      hunkDrafts: [
        {
          path: enc("src/app.ts"),
          startBefore: 1,
          countBefore: 2,
          startAfter: 1,
          countAfter: 2,
          lines: ["-removed line", "+added line"],
        },
      ],
    });
    expect(filteredOld.files).toHaveLength(1);
    expect(filteredOld.files[0]?.exclusion).toBe("filtered");
    expect(filteredOld.files[0]?.hunks ?? []).toEqual([]);

    // Unknown sizes never bypass the oversized bound: insufficient
    // information is explicitly unavailable, never silently allowed.
    const unknownSize = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: HEAD_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [],
      tipEntries: [
        {
          path: enc("data/blob.bin"),
          mode: "100644",
          oid: "f".repeat(40),
          stage: 0,
          kind: "file",
          isBinary: false,
        },
      ],
    });
    expect(unknownSize.files).toHaveLength(1);
    expect(unknownSize.files[0]?.exclusion).toBeDefined();
    expect(unknownSize.files[0]?.hunks ?? []).toEqual([]);
  });

  it("minor M9: present stages only, unchanged omitted, unmerged refused", () => {
    // An add/add conflict carries no stage 1: only present stages are facts.
    const added = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: INDEX_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [],
      tipEntries: [],
      conflictStages: [
        { path: enc("src/fresh.ts"), baseOid: null, oursOid: "2".repeat(40), theirsOid: "3".repeat(40) },
      ],
    });
    expect(added.files).toHaveLength(1);
    expect(added.files[0]?.stageOids).toEqual({
      "2": "2".repeat(40),
      "3": "3".repeat(40),
    });

    // Equal blobs under equal modes publish no fact at all.
    const same = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: HEAD_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [entry("src/app.ts", "c".repeat(40))],
      tipEntries: [entry("src/app.ts", "c".repeat(40))],
    });
    expect(same.files).toEqual([]);

    // Unmerged inventories never derive a flat diff silently.
    expect(() =>
      deriveLocalDiff({
        scope: SCOPE,
        worktreeId: WORKTREE_ID,
        kind: "staged",
        base: HEAD_ENDPOINT,
        tip: INDEX_ENDPOINT,
        baseEntries: [entry("src/app.ts", "c".repeat(40), { stage: 2 })],
        tipEntries: [entry("src/app.ts", "d".repeat(40))],
      }),
    ).toThrow();
  });

  it("structural: every emitted path is screened, whatever the exclusion reason", async () => {
    const { containsSecretText } = await import("../engram-live/content-policy.js");
    const { scanValuesForLeak } = await import("../engram-live/content-policy.js");
    const token = "AKIAIOSFODNN7SYNTHETIC";
    expect(containsSecretText(token)).toBe(true);
    const collect = (value: unknown): string[] => {
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
    };
    const tokenPath = `src/${token}.ts`;
    const cases: { name: string; build: () => ReturnType<typeof deriveLocalDiff> }[] = [
      {
        name: "filtered",
        build: () => deriveLocalDiff({
          scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
          base: INDEX_ENDPOINT, tip: WORKTREE_ENDPOINT,
          baseEntries: [], tipEntries: [entry(tokenPath, "a".repeat(40), { filtered: true })],
        }),
      },
      {
        name: "symlink",
        build: () => deriveLocalDiff({
          scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
          base: INDEX_ENDPOINT, tip: WORKTREE_ENDPOINT,
          baseEntries: [], tipEntries: [entry(tokenPath, "b".repeat(40), { kind: "symlink" })],
        }),
      },
      {
        name: "gitlink",
        build: () => deriveLocalDiff({
          scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
          base: INDEX_ENDPOINT, tip: WORKTREE_ENDPOINT,
          baseEntries: [], tipEntries: [entry(tokenPath, "c".repeat(40), { kind: "gitlink" })],
        }),
      },
      {
        name: "deleted",
        build: () => deriveLocalDiff({
          scope: SCOPE, worktreeId: WORKTREE_ID, kind: "staged",
          base: HEAD_ENDPOINT, tip: INDEX_ENDPOINT,
          baseEntries: [entry(tokenPath, "d".repeat(40))], tipEntries: [],
        }),
      },
      {
        name: "protected",
        build: () => deriveLocalDiff({
          scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
          base: INDEX_ENDPOINT, tip: WORKTREE_ENDPOINT,
          baseEntries: [], tipEntries: [entry(`.env.${token}`, "e".repeat(40))],
        }),
      },
      {
        name: "binary",
        build: () => deriveLocalDiff({
          scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
          base: INDEX_ENDPOINT, tip: WORKTREE_ENDPOINT,
          baseEntries: [], tipEntries: [entry(tokenPath, "f".repeat(40), { isBinary: true })],
        }),
      },
      {
        name: "oversized",
        build: () => deriveLocalDiff({
          scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
          base: INDEX_ENDPOINT, tip: WORKTREE_ENDPOINT,
          baseEntries: [], tipEntries: [entry(tokenPath, "0".repeat(40), { size: 8 * 1024 * 1024 })],
        }),
      },
      {
        name: "unknown-size",
        build: () => deriveLocalDiff({
          scope: SCOPE, worktreeId: WORKTREE_ID, kind: "unstaged",
          base: INDEX_ENDPOINT, tip: WORKTREE_ENDPOINT,
          baseEntries: [],
          tipEntries: [{ path: new TextEncoder().encode(tokenPath), mode: "100644", oid: "1".repeat(40), stage: 0, kind: "file", isBinary: false }],
        }),
      },
    ];
    for (const c of cases) {
      const diff = c.build();
      expect(diff.files.length).toBeGreaterThan(0);
      expect(scanValuesForLeak(collect(diff.files), [token])).toEqual([]);
    }
  });
});

// L4b-sol4 D — conception fixée par le conducteur : chaque étape de conflit
// est validée par chemin + numéro d'étape + OID face à l'inventaire.

const SOL4_CONFLICT = "src/clash.ts";

function sol4StagedEntry(path: string, oid: string, stage: number): LocalEntryInput {
  return {
    path: enc(path),
    mode: "100644",
    oid,
    stage,
    kind: "file",
    size: 120,
    isBinary: false,
  };
}

class Sol4DiffStore implements LatestSnapshotPort {
  readonly stored: LocalSnapshotDto[] = [];
  async loadLatest(_query: LatestSnapshotQuery): Promise<LocalSnapshotDto | null> {
    return this.stored.length > 0 ? this.stored[this.stored.length - 1]! : null;
  }
  async replaceLatest(
    snapshot: LocalSnapshotDto,
    expectedSupersededId: string | null,
    _generationId: string,
  ): Promise<ReplaceLatestReceipt> {
    const current = this.stored.length > 0 ? this.stored[this.stored.length - 1]! : null;
    if ((current?.snapshotId ?? null) !== expectedSupersededId) {
      throw new Error("latest replacement conflict");
    }
    if (current !== null && current.snapshotId !== snapshot.snapshotId) this.stored.pop();
    if (current?.snapshotId !== snapshot.snapshotId) this.stored.push(snapshot);
    return { received: true, retiredPrevious: true, revokedDecryptability: true, blockedStaleWork: true };
  }
  async purgePrivate(_query: LatestSnapshotScope): Promise<PurgePrivateReceipt> {
    return { purgedPrivate: true, blockedOldWork: true, revokedDecryptability: true };
  }
}

class Sol4DiffSink implements FactSinkPort {
  readonly batches: FactBatchDto[] = [];
  async deliver(batch: FactBatchDto): Promise<FactSinkReceipt> {
    this.batches.push(batch);
    return { received: true, batchId: batch.batchId, retiredSuperseded: true, revokedDecryptability: true };
  }
}

describe("L4b-sol4 D: les conflits correspondent par chemin, étape et OID", () => {
  it("mêmes numéros d'étape avec des OIDs différents : exclusion et couverture non current", async () => {
    const diff = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: INDEX_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "a".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "b".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "c".repeat(40), 3),
      ],
      tipEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "a".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "b".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "c".repeat(40), 3),
      ],
      conflictStages: [
        { path: enc(SOL4_CONFLICT), baseOid: "d".repeat(40), oursOid: "e".repeat(40), theirsOid: "f".repeat(40) },
      ],
      hunkDrafts: [
        {
          path: enc(SOL4_CONFLICT),
          startBefore: 1,
          countBefore: 1,
          startAfter: 1,
          countAfter: 1,
          lines: [" conflict body"],
        },
      ],
    });
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]?.exclusion).toBeDefined();
    expect(diff.files[0]?.hunks ?? []).toEqual([]);
    expect(validateLocalDiff(diff).ok).toBe(true);
    expect(diff.coverage).toBeDefined();
    expect(diff.coverage?.state).not.toBe("current");

    const staged = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "index",
      capturedAt: 1_700_000_500_000,
      diff,
      plaintextPayload: enc("public conflict mismatch"),
      protection: null,
      store: new Sol4DiffStore(),
      sink: new Sol4DiffSink(),
      batchId: "batch:l4b-sol4-conflict-mismatch",
      generationId: "gen:l4b-sol4-conflict-mismatch",
    });
    expect(staged.coverage.state).not.toBe("current");
  });

  it("inventaire 1/2/3 sans conflictStages déclaré : exclusion et couverture non current", async () => {
    const diff = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: INDEX_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "a".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "b".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "c".repeat(40), 3),
      ],
      tipEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "a".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "b".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "c".repeat(40), 3),
      ],
      hunkDrafts: [
        {
          path: enc(SOL4_CONFLICT),
          startBefore: 1,
          countBefore: 1,
          startAfter: 1,
          countAfter: 1,
          lines: [" conflict body"],
        },
      ],
    });
    expect(diff.files.length).toBeGreaterThan(0);
    for (const file of diff.files) {
      expect(file.exclusion).toBeDefined();
      expect(file.hunks ?? []).toEqual([]);
    }
    expect(validateLocalDiff(diff).ok).toBe(true);
    expect(diff.coverage).toBeDefined();
    expect(diff.coverage?.state).not.toBe("current");

    const staged = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "index",
      capturedAt: 1_700_000_501_000,
      diff,
      plaintextPayload: enc("public conflict undeclared"),
      protection: null,
      store: new Sol4DiffStore(),
      sink: new Sol4DiffSink(),
      batchId: "batch:l4b-sol4-conflict-undeclared",
      generationId: "gen:l4b-sol4-conflict-undeclared",
    });
    expect(staged.coverage.state).not.toBe("current");
  });

  it("OID divergent à l'étape 2 dans la seule pointe : exclusion et couverture non current", async () => {
    const tipOids = { base: "1".repeat(40), divergent: "d".repeat(40), theirs: "3".repeat(40) };
    const diff = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: INDEX_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "1".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "2".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "3".repeat(40), 3),
      ],
      tipEntries: [
        sol4StagedEntry(SOL4_CONFLICT, tipOids.base, 1),
        sol4StagedEntry(SOL4_CONFLICT, tipOids.divergent, 2),
        sol4StagedEntry(SOL4_CONFLICT, tipOids.theirs, 3),
      ],
      conflictStages: [
        { path: enc(SOL4_CONFLICT), baseOid: "1".repeat(40), oursOid: "2".repeat(40), theirsOid: "3".repeat(40) },
      ],
      hunkDrafts: [
        {
          path: enc(SOL4_CONFLICT),
          startBefore: 1,
          countBefore: 1,
          startAfter: 1,
          countAfter: 1,
          lines: [" conflict body"],
        },
      ],
    });
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]?.exclusion).toBeDefined();
    expect(diff.files[0]?.hunks ?? []).toEqual([]);
    expect(validateLocalDiff(diff).ok).toBe(true);
    expect(diff.coverage).toBeDefined();
    expect(diff.coverage?.state).not.toBe("current");

    const staged = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "index",
      capturedAt: 1_700_000_502_000,
      diff,
      plaintextPayload: enc("public conflict tip divergence"),
      protection: null,
      store: new Sol4DiffStore(),
      sink: new Sol4DiffSink(),
      batchId: "batch:l4b-m3-tip-divergence",
      generationId: "gen:l4b-m3-tip-divergence",
    });
    expect(staged.coverage.state).not.toBe("current");
  });

  it("entrée divergente supplémentaire dans la seule base : exclusion et couverture non current", async () => {
    const diff = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: INDEX_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "1".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "2".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "e".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "3".repeat(40), 3),
      ],
      tipEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "1".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "2".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "3".repeat(40), 3),
      ],
      conflictStages: [
        { path: enc(SOL4_CONFLICT), baseOid: "1".repeat(40), oursOid: "2".repeat(40), theirsOid: "3".repeat(40) },
      ],
      hunkDrafts: [
        {
          path: enc(SOL4_CONFLICT),
          startBefore: 1,
          countBefore: 1,
          startAfter: 1,
          countAfter: 1,
          lines: [" conflict body"],
        },
      ],
    });
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]?.exclusion).toBeDefined();
    expect(diff.files[0]?.hunks ?? []).toEqual([]);
    expect(validateLocalDiff(diff).ok).toBe(true);
    expect(diff.coverage).toBeDefined();
    expect(diff.coverage?.state).not.toBe("current");

    const staged = await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "index",
      capturedAt: 1_700_000_503_000,
      diff,
      plaintextPayload: enc("public conflict base divergence"),
      protection: null,
      store: new Sol4DiffStore(),
      sink: new Sol4DiffSink(),
      batchId: "batch:l4b-m3-base-divergence",
      generationId: "gen:l4b-m3-base-divergence",
    });
    expect(staged.coverage.state).not.toBe("current");
  });

  it("inventaire chemin, étape et OID concordants : le fait de conflit est conservé", () => {
    const diff = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: INDEX_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "1".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "2".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "3".repeat(40), 3),
      ],
      tipEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "1".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "2".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "3".repeat(40), 3),
      ],
      conflictStages: [
        { path: enc(SOL4_CONFLICT), baseOid: "1".repeat(40), oursOid: "2".repeat(40), theirsOid: "3".repeat(40) },
      ],
      hunkDrafts: [
        {
          path: enc(SOL4_CONFLICT),
          startBefore: 1,
          countBefore: 1,
          startAfter: 1,
          countAfter: 1,
          lines: [" conflict body"],
        },
      ],
    });
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]?.exclusion).toBeUndefined();
    expect(diff.files[0]?.stageOids).toEqual({
      "1": "1".repeat(40),
      "2": "2".repeat(40),
      "3": "3".repeat(40),
    });
    expect(diff.files[0]?.hunks).toHaveLength(1);
    expect(validateLocalDiff(diff).ok).toBe(true);
  });
});

// L4b-sol5 — prescriptions mineures du conducteur tour 5.

describe("L4b-sol5 mineur : déclarations dupliquées et étapes invalides", () => {
  it("une déclaration de conflit dupliquée est refusée : un seul fait, jamais deux", () => {
    const build = (): DeriveLocalDiffInput => ({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: INDEX_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "1".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "2".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "3".repeat(40), 3),
      ],
      tipEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "1".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "2".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "3".repeat(40), 3),
      ],
      conflictStages: [
        { path: enc(SOL4_CONFLICT), baseOid: "1".repeat(40), oursOid: "2".repeat(40), theirsOid: "3".repeat(40) },
        { path: enc(SOL4_CONFLICT), baseOid: "1".repeat(40), oursOid: "2".repeat(40), theirsOid: "3".repeat(40) },
      ],
    });
    let single: LocalDiffDto | null = null;
    let refusal: unknown = null;
    try {
      single = deriveLocalDiff(build());
    } catch (error) {
      refusal = error;
    }
    // Refus explicite ou fusion en un seul fait : jamais deux faits.
    expect(single === null || refusal === null).toBe(true);
    if (single !== null) {
      expect(single.files).toHaveLength(1);
    } else {
      expect(refusal).not.toBeNull();
    }
  });

  it("une entrée supplémentaire d'étape invalide (stage 4) produit une exclusion explicite", () => {
    const diff = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: INDEX_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "1".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "2".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "3".repeat(40), 3),
        sol4StagedEntry("src/stray.ts", "a".repeat(40), 4),
      ],
      tipEntries: [
        sol4StagedEntry(SOL4_CONFLICT, "1".repeat(40), 1),
        sol4StagedEntry(SOL4_CONFLICT, "2".repeat(40), 2),
        sol4StagedEntry(SOL4_CONFLICT, "3".repeat(40), 3),
        sol4StagedEntry("src/stray.ts", "a".repeat(40), 4),
      ],
      conflictStages: [
        { path: enc(SOL4_CONFLICT), baseOid: "1".repeat(40), oursOid: "2".repeat(40), theirsOid: "3".repeat(40) },
      ],
    });
    const stray = diff.files.find((file) => new TextDecoder().decode(file.path) === "src/stray.ts");
    expect(stray).toBeDefined();
    expect(stray?.exclusion).toBeDefined();
    expect(stray?.hunks ?? []).toEqual([]);
    expect(diff.coverage).toBeDefined();
    expect(diff.coverage?.state).not.toBe("current");
    expect(validateLocalDiff(diff).ok).toBe(true);
  });
});

// L4b-2 (rhanka/engram#368) — MAJEUR 2 Opus tour 7 : staged puis conflit sur
// le même worktree tiennent deux cibles explicites, sans exclusion
// silencieuse du staged (sonde P9). Données SYNTHÉTIQUES uniquement.
describe("L4b-2 explicit staged state", () => {
  /** Puits à une tenue par cible du contrat actuel : (tenant, clone, worktree, kind). */
  class TargetSink implements FactSinkPort {
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
      return {
        received: true,
        batchId: batch.batchId,
        retiredSuperseded: true,
        revokedDecryptability: true,
      };
    }
  }

  class AcceptStore implements LatestSnapshotPort {
    readonly stored: LocalSnapshotDto[] = [];
    async loadLatest(_query: LatestSnapshotQuery): Promise<LocalSnapshotDto | null> {
      return this.stored.length > 0 ? this.stored[this.stored.length - 1]! : null;
    }
    async replaceLatest(
      snapshot: LocalSnapshotDto,
      _expectedSupersededId: string | null,
      _generationId: string,
    ): Promise<ReplaceLatestReceipt> {
      this.stored.push(snapshot);
      return { received: true, retiredPrevious: true, revokedDecryptability: true, blockedStaleWork: true };
    }
    async purgePrivate(_query: LatestSnapshotScope): Promise<PurgePrivateReceipt> {
      return { purgedPrivate: true, blockedOldWork: true, revokedDecryptability: true };
    }
  }

  // L4b-2 (rhanka/engram#368): red until fixed — owner split 2026-10-12
  it.skip("the staged index state stays explicit when a conflict diff arrives", async () => {
    const stagedDiff = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "staged",
      base: HEAD_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [],
      tipEntries: [entry("src/resolved.ts", "d".repeat(40))],
    });
    const conflictDiff = deriveLocalDiff({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "conflict",
      base: INDEX_ENDPOINT,
      tip: INDEX_ENDPOINT,
      baseEntries: [],
      tipEntries: [],
      conflictStages: [
        { path: enc("src/c.ts"), baseOid: "1".repeat(40), oursOid: "2".repeat(40), theirsOid: "3".repeat(40) },
      ],
    });
    const store = new AcceptStore();
    const sink = new TargetSink();
    await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "index",
      capturedAt: 1_700_004_000_000,
      diff: stagedDiff,
      plaintextPayload: enc("public staged state"),
      protection: null,
      store,
      sink,
      batchId: "batch:l4b2-staged-kept",
      generationId: "gen:l4b2-0001",
    });
    await stageLocalSnapshot({
      scope: SCOPE,
      worktreeId: WORKTREE_ID,
      kind: "index",
      capturedAt: 1_700_004_001_000,
      diff: conflictDiff,
      plaintextPayload: enc("public conflict state"),
      protection: null,
      store,
      sink,
      batchId: "batch:l4b2-conflict-kept",
      generationId: "gen:l4b2-0002",
    });
    // L4b-2 : deux cibles tenues, une chacune — le staged ne disparaît pas.
    expect(sink.holdings.size).toBe(2);
    const heldKinds = [...sink.holdings.values()].map(
      (batch) => (batch.facts[0] as unknown as LocalDiffDto).kind,
    );
    expect(heldKinds).toContain("staged");
    expect(heldKinds).toContain("conflict");
  });
});
