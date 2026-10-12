// P1 — All-State GitHub PR Synchronization, seat E: (plan/09 P1; spec/SPEC_LIVE_GIT_INDEXING.md §§4–5).
//
// Test-first: this file is written before engram-live/pr-sync.ts,
// engram-live/pr-attribution.ts and the P1 contract additions exist, and must
// be observed RED first. Neutral E: only: injected GitHub page transport
// (no network), injected persistence (no base), fixtures of GitHub pages.
// H: (h2a transport) and S: (cluster-mesh mapping) are not implemented here;
// engram defines the neutral contracts they consume (see contracts.ts P1
// block). Owner decisions: PRs of every state indexed, no count or age
// limit, nothing erased.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type GithubRepositoryDto,
  type PrCoverageDto,
  type PrObjectJobDto,
  type PrPageDto,
  type PrSyncCursorDto,
  type PullRequestFactDto,
  type QualifiedOid,
  validatePrAttribution,
  validatePrPage,
} from "../engram-live/contracts.js";
import {
  type GithubPrTransportPort,
  PR_SYNC_OVERLAP_MS,
  type PrSyncPersistencePort,
  type PrTransportResult,
  canAcknowledgePrObjects,
  deduplicatePrObservations,
  deduplicatePrPageItems,
  observationIdentityKey,
  runPrSyncPass,
} from "../engram-live/pr-sync.js";
import { applyPrHeadUpdate, classifyMergeStrategy, pinPrAttribution } from "../engram-live/pr-attribution.js";
import { deriveReachability } from "../engram-live/history.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(root, "tests", "fixtures", "live-github-pages.json");

function sha1(tag: string, n: number): QualifiedOid {
  return {
    algorithm: "sha1",
    oid: createHash("sha1").update(`${tag}:${n}`).digest("hex"),
  };
}

// — Injected fakes: no network, no base. The transport serves pages only;
// the persistence keeps every distinct observation (nothing erased): rows are
// keyed by PR identity + observed head OID so a moved head never erases the
// previous observation, and object jobs are keyed by PR + OID for the same
// reason.
class FixtureTransport implements GithubPrTransportPort {
  private readonly pages: PrPageDto[];
  readonly requests: { cursor: string | null; etag: string | null }[] = [];
  constructor(pages: PrPageDto[]) {
    this.pages = pages;
  }
  async fetchPage(request: { cursor: string | null; etag?: string | null }): Promise<PrTransportResult> {
    this.requests.push({ cursor: request.cursor, etag: request.etag ?? null });
    const index = this.requests.length - 1;
    const served = this.pages[index];
    if (served === undefined) throw new Error(`fixture transport has no page ${index}`);
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
    if (!this.observations.has(key)) {
      this.observations.set(key, fact);
    }
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

function loadFixture(): { repository: GithubRepositoryDto; pages: PrPageDto[] } {
  const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as {
    repository: { owner: string; repo: string };
    pages: { cursor: string | null; items: PullRequestFactDto[]; nextCursor: string | null; hasMore: boolean; endProof?: "end-of-list" }[];
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
      headOid: { algorithm: "sha1" as const, oid: (item as unknown as { headOid: string }).headOid },
      headRef: (item as unknown as { headRef: string }).headRef,
      baseOid: { algorithm: "sha1" as const, oid: (item as unknown as { baseOid: string }).baseOid },
      baseRef: (item as unknown as { baseRef: string }).baseRef,
    })),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    ...(page.endProof !== undefined ? { endProof: page.endProof } : {}),
  }));
  return { repository, pages };
}

describe("P1 all-state GitHub PR synchronization (engram seat)", () => {
  it("all pages beyond 30 PRs include open closed and merged records and deduplicate moving pages", async () => {
    const { repository, pages } = loadFixture();
    expect(pages.length).toBe(3);
    const persistence = new MemoryPrPersistence();
    const outcome = await runPrSyncPass(
      { repository, sweepKind: "full", now: 1_700_100_000_000 },
      { transport: new FixtureTransport(pages), persistence },
    );
    expect(outcome.state).toBe("complete");
    // Beyond 30 PRs, no count cap: 36 page items, every distinct observation
    // retained (PR #7 keeps both heads), current view 35 PRs.
    expect(outcome.stats.itemsSeen).toBe(36);
    expect(outcome.stats.unique).toBe(35);
    expect(outcome.stats.duplicates).toBe(0);
    expect(outcome.observations).toHaveLength(36);
    const states = new Set(outcome.observations.map((fact) => fact.state));
    expect(states).toEqual(new Set(["open", "closed", "merged"]));
    // Drafts are indexed as drafts, never dropped.
    expect(outcome.observations.filter((fact) => fact.isDraft).length).toBeGreaterThanOrEqual(3);
    // Both historical heads of PR #7 are retained (nothing erased).
    const pr7heads = outcome.observations.filter((fact) => fact.number === 7).map((fact) => fact.headOid.oid).sort();
    expect(pr7heads).toEqual([
      "630f568670a432290640351b6e2fb47ef0d4d4e3",
      "fa14f1b24799fae1cf0014e8331cb00c8dc3d7d7",
    ]);
    // The current view keeps the newest head per PR, computed separately.
    const pr7 = deduplicatePrPageItems(outcome.observations).find((fact) => fact.number === 7)!;
    expect(pr7.headOid.oid).toBe("630f568670a432290640351b6e2fb47ef0d4d4e3");
    // Exact repeats deduplicate; distinct heads never collapse.
    expect(deduplicatePrObservations(outcome.observations)).toHaveLength(36);
    const doubled = deduplicatePrPageItems([...outcome.observations, pr7]);
    expect(doubled).toHaveLength(35);
    // No end of list without proof: a last page without endProof fails the
    // pass instead of silently completing (earlier pages stay persisted).
    const unproven = pages.map((page) => ({ ...page }));
    delete (unproven[unproven.length - 1] as { endProof?: unknown }).endProof;
    const failing = new MemoryPrPersistence();
    await expect(runPrSyncPass(
      { repository, sweepKind: "full", now: 1_700_100_000_001 },
      { transport: new FixtureTransport(unproven), persistence: failing },
    )).rejects.toThrow(/end-of-list/);
    const kept = await failing.listObservations();
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(36);
  });

  it("a 1501-commit PR remains investigable through merge squash rebase and force update", async () => {
    const repository: GithubRepositoryDto = { owner: "acme", repo: "demo" };
    const total = 1501;
    const base = sha1("pr1501-base", 0);
    const headA = sha1("pr1501-head", 1);
    const headB = sha1("pr1501-rebase", 2);
    const factFor = (head: QualifiedOid, updatedAt: number): PullRequestFactDto => ({
      repositoryOwner: repository.owner,
      repositoryRepo: repository.repo,
      number: 1501,
      state: "open",
      isDraft: false,
      updatedAt,
      headOid: head,
      headRef: "refs/pull/1501/head",
      baseOid: base,
      baseRef: "refs/heads/main",
    });
    const persistence = new MemoryPrPersistence();
    // First sweep ingests head A through the engine (no prefilled state).
    const first = await runPrSyncPass(
      { repository, sweepKind: "full", now: 1_700_000_000_000 },
      {
        transport: new FixtureTransport([{ items: [factFor(headA, 1_700_000_000_000)], nextCursor: null, hasMore: false, endProof: "end-of-list" }]),
        persistence,
      },
    );
    expect(first.state).toBe("complete");
    // The 1501-commit DAG behind head A walks through the history engine
    // without cap or truncation: reachability is derived, never hand-walked.
    const dagA: { oid: string; parents: readonly string[] }[] = [];
    let parent: string | null = null;
    for (let index = 0; index < total - 1; index += 1) {
      const oid = sha1("pr1501-commit", index).oid;
      dagA.push({ oid, parents: parent === null ? [] : [parent] });
      parent = oid;
    }
    dagA.push({ oid: headA.oid, parents: parent === null ? [] : [parent] });
    const ancestryA = deriveReachability(dagA, [{ name: "refs/pull/1501/head", qualifiedOid: headA }]);
    const walked = ancestryA.get("refs/pull/1501/head")!.size;
    expect(walked).toBe(total);
    // Acquisition of every engine-derived commit marks the head-A job.
    const jobA = (await persistence.listObjectJobs()).find((job) => job.headOid.oid === headA.oid)!;
    await persistence.updateObjectJob({
      ...jobA, state: "acquired", attempts: 1, lastError: null,
      acquiredOid: headA, totalCommits: walked, acquiredCommits: walked,
    });
    expect(canAcknowledgePrObjects(await persistence.listObjectJobs())).toBe(true);
    // Merge, squash and rebase are distinguished, never collapsed.
    const mergeOid = sha1("pr1501-merge", 1);
    const squashOid = sha1("pr1501-squash", 1);
    expect(pinPrAttribution({
      repositoryOwner: repository.owner, repositoryRepo: repository.repo, prNumber: 1501,
      baseOid: base, headOid: headA, mergeBaseOids: [base], mergeOid, mergeStrategy: "merge",
    }).status).toBe("complete");
    expect(pinPrAttribution({
      repositoryOwner: repository.owner, repositoryRepo: repository.repo, prNumber: 1501,
      baseOid: base, headOid: squashOid, mergeBaseOids: [base], mergeOid: squashOid, mergeStrategy: "squash",
    }).mergeStrategy).toBe("squash");
    expect(pinPrAttribution({
      repositoryOwner: repository.owner, repositoryRepo: repository.repo, prNumber: 1501,
      baseOid: base, headOid: headB, mergeBaseOids: [base], mergeOid: null, mergeStrategy: "rebase",
    }).mergeStrategy).toBe("rebase");
    // Force-push ingested through a second sweep: old head A stays retained
    // and acquired, new head B gets its own pending job.
    const second = await runPrSyncPass(
      { repository, sweepKind: "incremental", now: 1_700_000_100_000 },
      {
        transport: new FixtureTransport([{ items: [factFor(headB, 1_700_000_050_000)], nextCursor: null, hasMore: false, endProof: "end-of-list" }]),
        persistence,
      },
    );
    expect(second.state).toBe("complete");
    const heads = (await persistence.listObservations()).map((fact) => fact.headOid.oid).sort();
    expect(heads).toEqual([headA.oid, headB.oid].sort());
    const jobs = await persistence.listObjectJobs();
    const keptA = jobs.find((job) => job.headOid.oid === headA.oid)!;
    const keptB = jobs.find((job) => job.headOid.oid === headB.oid)!;
    expect(keptA.state).toBe("acquired");
    expect(keptA.acquiredCommits).toBe(1501);
    expect(keptB.state).toBe("pending");
    // Force update keeps history: the old head stays retained and queryable.
    const history = applyPrHeadUpdate([headA], { previousHead: headA, nextHead: headB, observedAt: 1_700_000_100_000 });
    expect(history.map((oid) => oid.oid)).toEqual([headA.oid, headB.oid]);
    // Reconstruction after resume through the history engine: both the
    // retained head A and the new head B resolve their full 1501 ancestry
    // from the retained DAG, even though no ref reaches A anymore.
    const dagAB = [...dagA, { oid: headB.oid, parents: parent === null ? [] : [parent] }];
    const rebuilt = deriveReachability(dagAB, [
      { name: "retained:1501/A", qualifiedOid: headA },
      { name: "refs/pull/1501/head", qualifiedOid: headB },
    ]);
    expect(rebuilt.get("retained:1501/A")!.size).toBe(total);
    expect(rebuilt.get("refs/pull/1501/head")!.size).toBe(total);
    expect(second.coverage.find((report) => report.axis === "object-availability")?.state).toBe("unavailable");
  });

  it("metadata cursor success cannot discard a failed object job or fabricate historical attribution", async () => {
    const { repository, pages } = loadFixture();
    const persistence = new MemoryPrPersistence();
    const outcome = await runPrSyncPass(
      { repository, sweepKind: "incremental", now: 1_700_100_000_000 },
      { transport: new FixtureTransport(pages), persistence },
    );
    expect(outcome.state).toBe("complete");
    // One object job fails: the metadata cursor still advances, the job stays failed.
    const jobs = await persistence.listObjectJobs();
    expect(jobs.length).toBeGreaterThan(0);
    const failed: PrObjectJobDto = { ...jobs[0]!, state: "failed", attempts: 2, lastError: "unavailable", acquiredOid: null };
    await persistence.updateObjectJob(failed);
    const refreshed = (await persistence.listObjectJobs()).find((job) => job.prNumber === failed.prNumber)!;
    expect(refreshed.state).toBe("failed");
    // The S mapping rule: a metadata receipt never acknowledges failed objects.
    expect(canAcknowledgePrObjects(await persistence.listObjectJobs())).toBe(false);
    const metadataAxis = outcome.coverage.find((report: PrCoverageDto) => report.axis === "pr-metadata");
    expect(metadataAxis?.state).toBe("current");
    // Attribution without merge-base evidence stays partial while the
    // acquired ancestry remains available (no fabrication from today's base).
    const fact = outcome.observations[0]!;
    const partial = pinPrAttribution({
      repositoryOwner: fact.repositoryOwner, repositoryRepo: fact.repositoryRepo, prNumber: fact.number,
      baseOid: fact.baseOid, headOid: fact.headOid, mergeBaseOids: [], mergeOid: null, mergeStrategy: "unknown",
    });
    expect(partial.status).toBe("partial");
    const complete = pinPrAttribution({
      repositoryOwner: fact.repositoryOwner, repositoryRepo: fact.repositoryRepo, prNumber: fact.number,
      baseOid: fact.baseOid, headOid: fact.headOid, mergeBaseOids: [fact.baseOid], mergeOid: null, mergeStrategy: "unknown",
    });
    expect(complete.status).toBe("complete");
  });

  it("offline auth failure and rate limits preserve last success and automatically resume with stale coverage", async () => {
    const { repository, pages } = loadFixture();
    const persistence = new MemoryPrPersistence();
    const first = await runPrSyncPass(
      { repository, sweepKind: "incremental", now: 1_700_100_000_000 },
      { transport: new FixtureTransport(pages), persistence },
    );
    expect(first.state).toBe("complete");
    const lastSuccess = (await persistence.loadCursor())!;
    expect(lastSuccess.lastSuccessAt).toBe(1_700_100_000_000);
    const failingKinds = ["offline", "auth_required", "rate_limited"] as const;
    for (const kind of failingKinds) {
      const failingTransport: GithubPrTransportPort = {
        async fetchPage(): Promise<PrTransportResult> {
          return { ok: false, kind, message: `simulated ${kind}`, ...(kind === "rate_limited" ? { retryAfterMs: 60_000 } : {}) };
        },
      };
      const outcome = await runPrSyncPass(
        { repository, sweepKind: "incremental", now: 1_700_100_000_000 + 300_000 },
        { transport: failingTransport, persistence },
      );
      expect(outcome.state).toBe("stale");
      // Last success preserved: observations kept, cursor keeps its success.
      expect((await persistence.listObservations()).length).toBe(36);
      expect((await persistence.loadCursor())!.lastSuccessAt).toBe(lastSuccess.lastSuccessAt);
      const axis = outcome.coverage.find((report) => report.axis === "pr-metadata")!;
      expect(axis.state).toBe(kind === "offline" || kind === "rate_limited" ? "stale" : "unavailable");
    }
    // Overlap is part of the resume contract: incremental retries re-ask with overlap.
    expect(PR_SYNC_OVERLAP_MS).toBeGreaterThan(0);
    // Automatic resume: the next available transport continues from the
    // preserved cursor without manual reset.
    const resumed = await runPrSyncPass(
      { repository, sweepKind: "incremental", now: 1_700_100_100_000 },
      { transport: new FixtureTransport(pages), persistence },
    );
    expect(resumed.state).toBe("complete");
    expect(await persistence.listObservations()).toHaveLength(36);
  });
});

describe("P1 Sol review scenarios (engram seat)", () => {
  function factFor(repository: GithubRepositoryDto, number: number, headTag: string, updatedAt: number): PullRequestFactDto {
    return {
      repositoryOwner: repository.owner,
      repositoryRepo: repository.repo,
      number,
      state: "open",
      isDraft: false,
      updatedAt,
      headOid: sha1(headTag, number),
      headRef: `refs/pull/${number}/head`,
      baseOid: sha1("review-base", 0),
      baseRef: "refs/heads/main",
    };
  }

  it("M1 keeps every distinct observed head and schedules each OID", async () => {
    const { repository, pages } = loadFixture();
    const persistence = new MemoryPrPersistence();
    const outcome = await runPrSyncPass(
      { repository, sweepKind: "full", now: 1_700_100_000_000 },
      { transport: new FixtureTransport(pages), persistence },
    );
    expect(outcome.state).toBe("complete");
    const pr7 = (await persistence.listObservations()).filter((fact) => fact.number === 7);
    expect(pr7.map((fact) => fact.headOid.oid).sort()).toEqual([
      "630f568670a432290640351b6e2fb47ef0d4d4e3",
      "fa14f1b24799fae1cf0014e8331cb00c8dc3d7d7",
    ]);
    const jobOids = (await persistence.listObjectJobs())
      .filter((job) => job.prNumber === 7).map((job) => job.headOid.oid).sort();
    expect(jobOids).toEqual([
      "630f568670a432290640351b6e2fb47ef0d4d4e3",
      "fa14f1b24799fae1cf0014e8331cb00c8dc3d7d7",
    ]);
  });

  it("M2 adds the force-pushed job without replacing the still-needed one", async () => {
    const repository: GithubRepositoryDto = { owner: "acme", repo: "demo" };
    const persistence = new MemoryPrPersistence();
    const pageFor = (tag: string, updatedAt: number): PrPageDto => ({
      items: [factFor(repository, 9, tag, updatedAt)],
      nextCursor: null, hasMore: false, endProof: "end-of-list",
    });
    await runPrSyncPass(
      { repository, sweepKind: "full", now: 1_700_000_000_000 },
      { transport: new FixtureTransport([pageFor("head-A", 1_700_000_000_000)]), persistence },
    );
    const headA = sha1("head-A", 9);
    const jobA = (await persistence.listObjectJobs()).find((job) => job.headOid.oid === headA.oid)!;
    await persistence.updateObjectJob({ ...jobA, state: "failed", attempts: 3, lastError: "unavailable", acquiredOid: null });
    await runPrSyncPass(
      { repository, sweepKind: "incremental", now: 1_700_000_100_000 },
      { transport: new FixtureTransport([pageFor("head-B", 1_700_000_050_000)]), persistence },
    );
    const jobs = await persistence.listObjectJobs();
    const keptA = jobs.find((job) => job.headOid.oid === headA.oid)!;
    const keptB = jobs.find((job) => job.headOid.oid === sha1("head-B", 9).oid)!;
    expect(keptA.state).toBe("failed");
    expect(keptA.attempts).toBe(3);
    expect(keptA.lastError).toBe("unavailable");
    expect(keptB.state).toBe("pending");
  });

  it("M3 persists pages already received when a late failure interrupts the sweep", async () => {
    const repository: GithubRepositoryDto = { owner: "acme", repo: "demo" };
    const persistence = new MemoryPrPersistence();
    const page1: PrPageDto = {
      items: Array.from({ length: 12 }, (_, index) => factFor(repository, index + 1, "m3-a", 1_700_000_000_000 + index)),
      nextCursor: "p2", hasMore: true,
    };
    const transport: GithubPrTransportPort = {
      calls: 0,
      async fetchPage(request: { cursor: string | null }): Promise<PrTransportResult> {
        (this as unknown as { calls: number }).calls += 1;
        if (request.cursor === null) return { ok: true, page: page1 };
        return { ok: false, kind: "offline", message: "link down after page 1" };
      },
    } as GithubPrTransportPort;
    const outcome = await runPrSyncPass(
      { repository, sweepKind: "full", now: 1_700_000_100_000 },
      { transport, persistence },
    );
    expect(outcome.state).toBe("stale");
    expect((await persistence.listObservations())).toHaveLength(12);
    expect((await persistence.listObjectJobs())).toHaveLength(12);
    expect((await persistence.loadCursor())!.pendingRetry?.kind).toBe("offline");
    expect((await persistence.loadCursor())!.lastSuccessAt).toBeNull();
  });

  it("M4 rejects a contradictory pagination as complete", () => {
    const items: PullRequestFactDto[] = [];
    const checked = validatePrPage({ items, hasMore: false, endProof: "end-of-list", nextCursor: "p2" });
    expect(checked.ok).toBe(false);
    const continued = validatePrPage({ items, hasMore: true, nextCursor: "p2", endProof: "end-of-list" });
    expect(continued.ok).toBe(false);
  });

  it("M5 never persists a foreign repository list nor completes the requested one", async () => {
    const repository: GithubRepositoryDto = { owner: "acme", repo: "demo" };
    const foreign: GithubRepositoryDto = { owner: "other", repo: "demo" };
    const persistence = new MemoryPrPersistence();
    await expect(runPrSyncPass(
      { repository, sweepKind: "full", now: 1_700_000_000_000 },
      {
        transport: new FixtureTransport([{
          items: [factFor(foreign, 1, "foreign", 1_700_000_000_000)],
          nextCursor: null, hasMore: false, endProof: "end-of-list",
        }]),
        persistence,
      },
    )).rejects.toThrow(/acme\/demo/);
    expect(await persistence.listObservations()).toHaveLength(0);
    expect(await persistence.listObjectJobs()).toHaveLength(0);
  });

  it("M6 keeps an unknown base explicit and refuses proof-less completeness", () => {
    const repository: GithubRepositoryDto = { owner: "acme", repo: "demo" };
    const pinned = pinPrAttribution({
      repositoryOwner: repository.owner, repositoryRepo: repository.repo, prNumber: 3,
      baseOid: null, headOid: sha1("m6-head", 3), mergeBaseOids: [sha1("m6-base", 0)],
    });
    expect(pinned.status).toBe("partial");
    expect(pinned.baseOid).toBeNull();
    const proofLess = validatePrAttribution({
      repositoryOwner: repository.owner, repositoryRepo: repository.repo, prNumber: 3,
      baseOid: sha1("m6-base", 0), headOid: sha1("m6-head", 3), mergeBaseOids: [],
      mergeOid: null, mergeStrategy: "unknown", status: "complete", reason: "no evidence",
    });
    expect(proofLess.ok).toBe(false);
  });

  it("acknowledgement requires the verified OID and coherent counters", () => {
    const repository: GithubRepositoryDto = { owner: "acme", repo: "demo" };
    const head = sha1("ack-head", 1);
    const other = sha1("ack-other", 2);
    const base = {
      repositoryOwner: repository.owner, repositoryRepo: repository.repo, prNumber: 1,
      headOid: head, state: "acquired" as const, attempts: 1, lastError: null,
      acquiredOid: head, totalCommits: 1501, acquiredCommits: 1501,
    };
    expect(canAcknowledgePrObjects([base])).toBe(true);
    expect(canAcknowledgePrObjects([{ ...base, acquiredOid: other }])).toBe(false);
    expect(canAcknowledgePrObjects([{ ...base, acquiredCommits: 1 }])).toBe(false);
    expect(canAcknowledgePrObjects([{ ...base, lastError: "unavailable" as const }])).toBe(false);
    expect(canAcknowledgePrObjects([])).toBe(false);
  });

  it("a lone merge OID never proves the merge strategy", () => {
    expect(classifyMergeStrategy({ mergeOid: sha1("merge-lone", 1) })).toBe("unknown");
    expect(classifyMergeStrategy({ strategy: "merge", mergeOid: sha1("merge-lone", 1) })).toBe("merge");
  });

  it("ETags stay bound to their repository, filter and cursor", async () => {
    const repository: GithubRepositoryDto = { owner: "acme", repo: "demo" };
    const persistence = new MemoryPrPersistence();
    const pages: PrPageDto[] = [
      { items: [factFor(repository, 1, "etag-a", 1_700_000_000_001)], nextCursor: "p2", hasMore: true, etag: "E1" },
      { items: [factFor(repository, 2, "etag-b", 1_700_000_000_002)], nextCursor: null, hasMore: false, endProof: "end-of-list", etag: "E2" },
    ];
    const firstTransport = new FixtureTransport(pages);
    await runPrSyncPass({ repository, sweepKind: "full", now: 1_700_000_000_000 }, { transport: firstTransport, persistence });
    const secondTransport = new FixtureTransport(pages);
    await runPrSyncPass({ repository, sweepKind: "full", now: 1_700_000_100_000 }, { transport: secondTransport, persistence });
    // Same cursor gets the same ETag back; page-1 ETag never leaks to page 2.
    expect(secondTransport.requests[0]).toEqual({ cursor: null, etag: "E1" });
    expect(secondTransport.requests[1]).toEqual({ cursor: "p2", etag: "E2" });
  });

  it("tour2-M1 same head with differing metadata keeps both observations", async () => {
    const repository: GithubRepositoryDto = { owner: "acme", repo: "demo" };
    const headA = sha1("tour2-m1-head", 42);
    const openFact: PullRequestFactDto = {
      repositoryOwner: repository.owner,
      repositoryRepo: repository.repo,
      number: 42,
      state: "open",
      isDraft: false,
      updatedAt: 1_700_000_000_000,
      headOid: headA,
      headRef: "refs/pull/42/head",
      baseOid: sha1("tour2-m1-base", 10),
      baseRef: "refs/heads/main",
    };
    const mergedFact: PullRequestFactDto = {
      repositoryOwner: repository.owner,
      repositoryRepo: repository.repo,
      number: 42,
      state: "merged",
      isDraft: false,
      updatedAt: 1_700_000_050_000,
      headOid: headA,
      headRef: "refs/pull/42/head",
      baseOid: sha1("tour2-m1-base", 20),
      baseRef: "refs/heads/main",
      mergeOid: sha1("tour2-m1-squash", 1),
      mergeStrategy: "squash",
    };
    const persistence = new MemoryPrPersistence();
    const outcome = await runPrSyncPass(
      { repository, sweepKind: "full", now: 1_700_000_100_000 },
      {
        transport: new FixtureTransport([
          { items: [openFact], nextCursor: "p2", hasMore: true },
          { items: [mergedFact], nextCursor: null, hasMore: false, endProof: "end-of-list" },
        ]),
        persistence,
      },
    );
    expect(outcome.state).toBe("complete");
    const pr42 = (await persistence.listObservations()).filter((fact) => fact.number === 42);
    expect(pr42).toHaveLength(2);
    expect(new Set(pr42.map((fact) => fact.state))).toEqual(new Set(["open", "merged"]));
    expect(outcome.stats.duplicates).toBe(0);
    // Jobs stay deduplicated by PR+OID: one head, one job.
    const jobs42 = (await persistence.listObjectJobs()).filter((job) => job.prNumber === 42);
    expect(jobs42).toHaveLength(1);
  });

  it("tour2-M2 interruption between observation and job is recovered on resume", async () => {
    const repository: GithubRepositoryDto = { owner: "acme", repo: "demo" };
    const headA = sha1("tour2-m2-head", 11);
    const headB = sha1("tour2-m2-head", 12);
    const factA: PullRequestFactDto = {
      repositoryOwner: repository.owner,
      repositoryRepo: repository.repo,
      number: 11,
      state: "open",
      isDraft: false,
      updatedAt: 1_700_000_000_000,
      headOid: headA,
      headRef: "refs/pull/11/head",
      baseOid: sha1("tour2-m2-base", 0),
      baseRef: "refs/heads/main",
    };
    const factB: PullRequestFactDto = {
      ...factA,
      updatedAt: 1_700_000_050_000,
      headOid: headB,
    };
    class FlakyJobPersistence extends MemoryPrPersistence {
      failNextJob = true;
      override async recordObjectJob(job: PrObjectJobDto): Promise<void> {
        if (this.failNextJob) {
          this.failNextJob = false;
          throw new Error("injected recordObjectJob failure between observation and job");
        }
        return super.recordObjectJob(job);
      }
    }
    const persistence = new FlakyJobPersistence();
    await expect(runPrSyncPass(
      { repository, sweepKind: "full", now: 1_700_000_000_000 },
      {
        transport: new FixtureTransport([{ items: [factA], nextCursor: null, hasMore: false, endProof: "end-of-list" }]),
        persistence,
      },
    )).rejects.toThrow(/injected recordObjectJob failure/);
    expect((await persistence.listObservations()).map((fact) => fact.headOid.oid)).toEqual([headA.oid]);
    expect(await persistence.listObjectJobs()).toHaveLength(0);
    const resumed = await runPrSyncPass(
      { repository, sweepKind: "incremental", now: 1_700_000_100_000 },
      {
        transport: new FixtureTransport([{ items: [factB], nextCursor: null, hasMore: false, endProof: "end-of-list" }]),
        persistence,
      },
    );
    expect(resumed.state).toBe("complete");
    expect((await persistence.listObservations()).map((fact) => fact.headOid.oid).sort()).toEqual([headA.oid, headB.oid].sort());
    const jobOids = (await persistence.listObjectJobs()).map((job) => job.headOid.oid).sort();
    expect(jobOids).toEqual([headA.oid, headB.oid].sort());
  });

  it("tour2 object coverage follows the acknowledgement invariants", async () => {
    const repository: GithubRepositoryDto = { owner: "acme", repo: "demo" };
    const head = sha1("tour2-cov-head", 77);
    const fact: PullRequestFactDto = {
      repositoryOwner: repository.owner,
      repositoryRepo: repository.repo,
      number: 77,
      state: "open",
      isDraft: false,
      updatedAt: 1_700_000_000_000,
      headOid: head,
      headRef: "refs/pull/77/head",
      baseOid: sha1("tour2-cov-base", 0),
      baseRef: "refs/heads/main",
    };
    const persistence = new MemoryPrPersistence();
    await runPrSyncPass(
      { repository, sweepKind: "full", now: 1_700_000_000_000 },
      {
        transport: new FixtureTransport([{ items: [fact], nextCursor: null, hasMore: false, endProof: "end-of-list" }]),
        persistence,
      },
    );
    // Contradictory receipt: wrong OID, partial 1/1501 counts, residual error.
    const job = (await persistence.listObjectJobs()).find((entry) => entry.headOid.oid === head.oid)!;
    await persistence.updateObjectJob({
      ...job,
      state: "acquired",
      attempts: 1,
      lastError: "unavailable",
      acquiredOid: sha1("tour2-cov-other", 1),
      totalCommits: 1501,
      acquiredCommits: 1,
    });
    expect(canAcknowledgePrObjects(await persistence.listObjectJobs())).toBe(false);
    const outcome = await runPrSyncPass(
      { repository, sweepKind: "incremental", now: 1_700_000_100_000 },
      {
        transport: new FixtureTransport([{ items: [{ ...fact, updatedAt: 1_700_000_050_000 }], nextCursor: null, hasMore: false, endProof: "end-of-list" }]),
        persistence,
      },
    );
    expect(outcome.state).toBe("complete");
    expect(outcome.coverage.find((report) => report.axis === "object-availability")?.state).toBe("unavailable");
  });
});
