// L2b — Roots, Retained DAG And OID Completion (plan/09 L2b; spec/SPEC_LIVE_GIT_INDEXING.md
// §§3–4, 6, A02–A04). Test-first: this file is written before engram-live/history.ts,
// engram-live/refs.ts and engram-live/repository.ts exist, and must be observed RED first.
//
// This test is NOT part of the neutral test closure of tests/live-neutrality.test.ts:
// it exercises the injected Git port and the injected persistence port against the
// L0 corpus (tests/helpers/live-git-fixtures.ts), not only the @sentropic/engram-live
// package surface.
//
// Owner decisions (dated, plan/09 L2b): roots are the default branch even when old,
// local and known remote branches active within 30 days, PR heads of all states,
// HEADs of registered worktrees including detached ones, and previously ingested
// roots. The 30-day window only selects followed branches; it never prunes already
// ingested commits, and no age/count cap exists anywhere on the live chain.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { basename, delimiter, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCorpus, buildHistory, detectGitCapabilities, inventoryDigest, LiveGitSandbox,
} from "./helpers/live-git-fixtures.js";
import {
  ACTIVITY_WINDOW_DAYS, POLICY_VERSION, validateRawRefObservation,
  type HistoryCommitFactDto, type HistoryCompletionQuery, type HistoryCompletionState,
  type HistoryCoverageReportDto, type HistoryCheckpointDto, type HistoryPersistencePort,
  type OidAlgorithm, type QualifiedOid, type RawRefObservationDto, type RetainedRootDto,
  type RootSelectionSignal, type SelectedRootDto, type TrackedRefDto, type WorktreeHead,
} from "../engram-live/contracts.js";
import { classifyRefName, selectHistoryRoots, trackRef } from "../engram-live/refs.js";
import {
  observeRepository, type RepositoryObservationDto, type RepositoryObservationInput,
} from "../engram-live/repository.js";
import {
  DerivedReachabilityCache, HISTORY_EXTRACTOR_VERSION, deriveReachability, runHistoryPass,
  type HistoryPassOutcome, type HistoryPassStats,
} from "../engram-live/history.js";
import type { GitLaunch, GitProcess, GitProcessPort, GitProcessExit, GitStdin } from "../engram-live/git-stream.js";

type Purpose = GitLaunch["purpose"];

const DAY = 86_400_000;
// The L0 trace fixes GIT_COMMITTER_DATE/GIT_AUTHOR_DATE to 1700000000 +0000, so
// every fixture commit carries this committer time; it is the bootstrap activity
// signal the neutral model consumes.
const FIXTURE_TIME = 1_700_000_000_000;

// — Hermetic Git port, same conventions as the L2a port: no system/global config,
// optional locks off, no lazy fetch, no replace refs, no prompt, one Trace2 file.
class SandboxGitPort implements GitProcessPort {
  readonly launches: { purpose: Purpose; args: string[] }[] = [];
  readonly tracePath: string;
  maxActive = 0;
  private active = 0;
  private static traceCount = 0;

  constructor(private readonly box: LiveGitSandbox) {
    SandboxGitPort.traceCount += 1;
    this.tracePath = join(box.root, `l2b-trace2-${SandboxGitPort.traceCount}.jsonl`);
  }

  async start(launch: GitLaunch): Promise<GitProcess> {
    this.launches.push({ purpose: launch.purpose, args: [...launch.args] });
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    const child = spawn(this.box.trace.executable, launch.args, {
      cwd: launch.cwd,
      env: {
        PATH: [dirname(this.box.trace.executable), "/usr/bin", "/bin"].join(delimiter),
        HOME: this.box.root,
        XDG_CONFIG_HOME: this.box.root,
        TMPDIR: this.box.root,
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
        this.active -= 1;
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

  counts(): Record<Purpose, number> {
    const out: Record<Purpose, number> = { "rev-list-count": 0, "rev-list": 0, "cat-file": 0, "diff-tree": 0 };
    for (const launch of this.launches) out[launch.purpose] += 1;
    return out;
  }

  /** No repository-triggered child program ran in any port launch (Trace2). */
  assertSafeTrace(): void {
    expect(existsSync(this.tracePath)).toBe(true);
    const events = readFileSync(this.tracePath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const children = events.filter((event) => event.event === "child_start");
    expect(children, `repository-triggered child program: ${JSON.stringify(children)}`).toEqual([]);
    expect(events.filter((event) => event.event === "start").length).toBe(this.launches.length);
    for (const launch of this.launches) {
      // No age, count or first-parent cap ever reaches a live launch (owner L2b).
      for (const arg of launch.args) {
        expect(arg).not.toMatch(/^--(max-count|since|until|first-parent)/);
      }
      expect(launch.args).toContain("--no-optional-locks");
      expect(launch.args).toContain("core.fsmonitor=false");
    }
  }
}

// — Injected persistence fake: an in-memory port, never a base. The port interface
// itself has no commit × branch edge method, so no ON_BRANCH-shaped record can
// exist; recordKinds witnesses the persisted record classes. Every record is
// keyed by clone: a query for one clone never receives another clone's rows.
const pkey = (cloneId: string, oid: string): string => `${cloneId}:${oid}`;
class MemoryHistoryPersistence implements HistoryPersistencePort {
  readonly facts = new Map<string, HistoryCommitFactDto>();
  readonly completion = new Map<string, HistoryCheckpointDto>();
  readonly retainedRoots = new Map<string, RetainedRootDto>();
  readonly recordKinds: string[] = [];
  failCompletionAfter?: number;
  private completionCalls = 0;

  async loadCompletion(query: HistoryCompletionQuery): Promise<HistoryCompletionState> {
    const checkpoints = [...this.completion.values()].filter((checkpoint) =>
      checkpoint.cloneId === query.cloneId && checkpoint.algorithm === query.algorithm);
    return {
      knownComplete: checkpoints.map((checkpoint) => checkpoint.oid),
      checkpoints: checkpoints.map((checkpoint) => ({ ...checkpoint, parents: [...checkpoint.parents] })),
      retainedRoots: [...this.retainedRoots.values()].filter((root) =>
        root.cloneId === query.cloneId && root.algorithm === query.algorithm),
    };
  }

  async persistCommitFact(fact: HistoryCommitFactDto): Promise<{ received: true }> {
    this.facts.set(pkey(fact.cloneId, fact.oid), fact);
    this.recordKinds.push("commit-fact");
    return { received: true };
  }

  async recordCompletion(checkpoint: HistoryCheckpointDto): Promise<{ received: true }> {
    if (this.failCompletionAfter !== undefined && this.completionCalls >= this.failCompletionAfter) {
      throw new Error("durable acknowledgement interrupted");
    }
    this.completionCalls += 1;
    this.completion.set(pkey(checkpoint.cloneId, checkpoint.oid), checkpoint);
    this.recordKinds.push("completion");
    return { received: true };
  }

  async recordRetainedRoot(root: RetainedRootDto): Promise<{ received: true }> {
    this.retainedRoots.set(pkey(root.cloneId, root.oid), root);
    this.recordKinds.push("retained-root");
    return { received: true };
  }
}

const sandboxes: LiveGitSandbox[] = [];
function sandbox(): LiveGitSandbox {
  const value = new LiveGitSandbox();
  sandboxes.push(value);
  return value;
}
afterEach(() => {
  for (const value of sandboxes.splice(0)) value.dispose();
});

// — Host-side observation helpers. The neutral model never launches Git itself:
// the host feeds full-ref observations (with tip committer time as the bootstrap
// activity signal) and host-resolved identity components.

/** Observe every ref through for-each-ref; tags are inventoried but never roots. */
function observeRefs(box: LiveGitSandbox, repo: string, observedAt: number): RawRefObservationDto[] {
  const out = box.git(repo, [
    "for-each-ref", "--sort=refname",
    "--format=%(refname)%00%(objectname)%00%(committerdate:unix)",
  ], undefined, "oracle").toString();
  const observations: RawRefObservationDto[] = [];
  for (const line of out.trim().split("\n")) {
    if (line === "") continue;
    const [refName, oid, committerUnix] = line.split("\0");
    const observation: RawRefObservationDto = {
      refName: refName!,
      oid: oid!,
      observedAt,
      ...(committerUnix !== undefined && committerUnix !== "" ? { tipCommitterUnixSeconds: Number(committerUnix) } : {}),
    };
    expect(validateRawRefObservation(observation).ok, `host observation of ${refName}`).toBe(true);
    observations.push(observation);
  }
  return observations;
}

function resolveHead(box: LiveGitSandbox, worktreePath: string): WorktreeHead {
  const verified = box.probe(worktreePath, ["rev-parse", "--verify", "HEAD"], "oracle");
  if (verified.status !== 0) return { kind: "unborn" };
  const symref = box.probe(worktreePath, ["symbolic-ref", "-q", "HEAD"], "oracle");
  if (symref.status === 0) return { kind: "branch", refName: symref.stdout.toString().trim() };
  return { kind: "detached", oid: verified.stdout.toString().trim() };
}

function repositoryInput(
  box: LiveGitSandbox,
  options: {
    readonly commonDirRealpath: string;
    readonly oidAlgorithm: OidAlgorithm;
    readonly worktrees: readonly { worktreePath: string; worktreeFingerprint: string }[];
    readonly shallowBoundary?: readonly string[];
  },
): RepositoryObservationInput {
  return {
    hostScope: "l2b-test-host",
    commonDirRealpath: options.commonDirRealpath,
    commonDirProjectFingerprint: "ws:corpus-project",
    oidAlgorithm: options.oidAlgorithm,
    worktrees: options.worktrees.map((worktree) => ({
      worktreePath: worktree.worktreePath,
      gitDir: box.git(worktree.worktreePath, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim(),
      worktreeFingerprint: worktree.worktreeFingerprint,
      head: resolveHead(box, worktree.worktreePath),
    })),
    ...(options.shallowBoundary !== undefined ? { shallowBoundary: [...options.shallowBoundary] } : {}),
  };
}

async function runPass(options: {
  readonly box: LiveGitSandbox;
  readonly repository: RepositoryObservationDto;
  readonly observations: readonly RawRefObservationDto[];
  readonly now: number;
  readonly cwd: string;
  readonly persistence: MemoryHistoryPersistence;
  readonly defaultBranch?: string;
}): Promise<{ outcome: HistoryPassOutcome; port: SandboxGitPort }> {
  const port = new SandboxGitPort(options.box);
  const outcome = await runHistoryPass(
    {
      repository: options.repository,
      defaultBranch: options.defaultBranch ?? "refs/heads/main",
      refObservations: options.observations,
      now: options.now,
      cwd: options.cwd,
    },
    { git: port, persistence: options.persistence },
  );
  return { outcome, port };
}

function rootOids(roots: readonly SelectedRootDto[]): Set<string> {
  return new Set(roots.map((root) => root.qualifiedOid.oid));
}

function sourceKey(root: SelectedRootDto): string {
  return root.sources
    .map((source) => `${source.signal}|${source.refName ?? "-"}|${source.worktreeId ?? "-"}|${source.activityAt ?? "-"}`)
    .sort()
    .join("; ");
}

function dagOf(persistence: MemoryHistoryPersistence): { oid: string; parents: readonly string[] }[] {
  return [...persistence.facts.values()].map((fact) => ({ oid: fact.oid, parents: fact.parents }));
}

const SIGNALS: readonly RootSelectionSignal[] = [
  "default-branch", "active-window", "pr-head", "worktree-head", "previously-ingested",
];

function bySignal(roots: readonly SelectedRootDto[]): Record<RootSelectionSignal, number> {
  const out = Object.fromEntries(SIGNALS.map((signal) => [signal, 0])) as Record<RootSelectionSignal, number>;
  for (const root of roots) for (const source of root.sources) out[source.signal] += 1;
  return out;
}

describe("L2b roots, retained DAG and OID completion", () => {
  it("default branch, active local and remote refs, all-state PR roots and detached worktree heads retain uncapped ancestry", async () => {
    const box = sandbox();
    const capabilities = detectGitCapabilities(box);

    for (const format of capabilities.objectFormats) {
      const corpus = buildCorpus(box, format, "files");
      const before = inventoryDigest(corpus);
      const repository = observeRepository(repositoryInput(box, {
        commonDirRealpath: realpathSync(join(corpus.repo, ".git")),
        oidAlgorithm: format,
        worktrees: [
          { worktreePath: corpus.repo, worktreeFingerprint: "wtfp:main" },
          { worktreePath: corpus.linked, worktreeFingerprint: "wtfp:linked" },
          { worktreePath: corpus.detached, worktreeFingerprint: "wtfp:detached" },
          { worktreePath: corpus.sparse, worktreeFingerprint: "wtfp:sparse" },
        ],
      }));
      // Linked worktrees share one clone; every worktree identity stays isolated.
      expect(new Set(repository.worktrees.map((worktree) => worktree.identity.cloneId)).size).toBe(1);
      expect(new Set(repository.worktrees.map((worktree) => worktree.identity.worktreeId)).size).toBe(4);

      const now = FIXTURE_TIME + 5 * DAY;
      const persistence = new MemoryHistoryPersistence();
      const { outcome, port } = await runPass({
        box, repository, observations: observeRefs(box, corpus.repo, now), now,
        cwd: corpus.repo, persistence,
      });

      // Root selection: default branch, active local/remote refs, PR heads of all
      // states (their state labels arrive with P1; selection is state-independent),
      // detached and branch worktree HEADs. Tags are inventoried, never roots.
      expect(outcome.state).toBe("complete");
      expect(outcome.coverage).toEqual([]);
      expect(classifyRefName("refs/tags/v0")).toBe("tag");
      const commits = corpus.commits;
      expect(rootOids(outcome.roots)).toEqual(new Set([
        commits.main, commits.right, commits.joinedRoots, commits.root,
        commits.third, commits.left, commits.merge,
      ]));
      expect(outcome.stats.rootsSelected).toBe(7);
      expect(bySignal(outcome.roots)).toEqual({
        "default-branch": 1, "active-window": 6, "pr-head": 3,
        "worktree-head": 4, "previously-ingested": 0,
      });
      // Provenance: every source records which signal selected it and the activity
      // date the branch was last worked on, never the polling time.
      const mainRoot = outcome.roots.find((root) => root.qualifiedOid.oid === commits.main)!;
      expect(mainRoot.sources.some((source) => source.signal === "default-branch" && source.refName === "refs/heads/main")).toBe(true);
      // The walk names the observed OID; the live ref name stays provenance only.
      expect(mainRoot.rev).toBe(commits.main);
      for (const root of outcome.roots) {
        for (const source of root.sources) {
          if (source.signal === "active-window" || source.signal === "default-branch") {
            expect(source.activityAt).toBe(FIXTURE_TIME);
            expect(source.generation).toBe(1);
          }
        }
      }
      const detachedRoot = outcome.roots.find((root) => root.qualifiedOid.oid === commits.merge)!;
      // A detached worktree head roots by its raw OID; it is not a ref.
      expect(detachedRoot.sources.some((source) => source.signal === "worktree-head" && source.refName === null)).toBe(true);

      // Uncapped ancestry: nine commits whatever the branch count, with ordered
      // parents preserved (merge, octopus, joined-roots second parent).
      expect(outcome.stats.commitsExtracted).toBe(9);
      expect(persistence.facts.size).toBe(9);
      expect(persistence.completion.size).toBe(9);
      expect([...persistence.completion.values()].every((checkpoint) =>
        checkpoint.extractorVersion === HISTORY_EXTRACTOR_VERSION && checkpoint.policyVersion === POLICY_VERSION)).toBe(true);
      const factByOid = new Map([...persistence.facts.values()].map((fact) => [fact.oid, fact]));
      const byName = new Map(Object.entries(commits).map(([name, oid]) => [oid, name]));
      for (const fact of persistence.facts.values()) {
        expect(fact.algorithm).toBe(format);
        expect(fact.oid).toMatch(format === "sha1" ? /^[0-9a-f]{40}$/ : /^[0-9a-f]{64}$/);
        expect(Buffer.from(fact.message).toString("utf8")).toBe(`${byName.get(fact.oid)}\n`);
      }
      expect(factByOid.get(commits.merge)!.parents).toEqual([commits.left, commits.right]);
      expect(factByOid.get(commits.octopus)!.parents).toEqual([commits.left, commits.right, commits.third]);
      expect(factByOid.get(commits.joinedRoots)!.parents).toEqual([commits.root, commits.unrelated]);
      // Immutable sharing: the same commit reached from a PR head, a branch and a
      // detached worktree head is extracted exactly once (one fact per OID).
      expect(factByOid.get(commits.main)!.oid).toBe(commits.main);

      // Retained roots recorded for investigation, queryable through the port.
      expect(persistence.retainedRoots.size).toBe(7);
      expect(persistence.retainedRoots.get(pkey(repository.clone.cloneId, commits.merge))!.firstSignal).toBe("worktree-head");

      // Old evaluation time: the default branch stays a root even when old, PR
      // heads of all states stay roots regardless of age, worktree HEADs stay
      // roots, the 30-day window drops only the followed branch selection, and
      // the previously ingested roots are re-selected without extraction work.
      const oldNow = FIXTURE_TIME + 100 * DAY;
      const oldPass = await runPass({
        box, repository, observations: observeRefs(box, corpus.repo, oldNow), now: oldNow,
        cwd: corpus.repo, persistence,
      });
      expect(oldPass.outcome.state).toBe("complete");
      expect(bySignal(oldPass.outcome.roots)).toEqual({
        "default-branch": 1, "active-window": 0, "pr-head": 3,
        "worktree-head": 4, "previously-ingested": 7,
      });
      // The window never prunes ingested commits: nothing was re-extracted and
      // nothing was deleted; the retained set is unchanged.
      expect(oldPass.outcome.stats.commitsExtracted).toBe(0);
      expect(oldPass.outcome.stats.commitsSkippedComplete).toBe(9);
      expect(persistence.facts.size).toBe(9);
      expect(persistence.retainedRoots.size).toBe(7);

      // Explicit shallow coverage: a grafted clone never fabricates complete
      // ancestry; the declared boundary is reported as an explicit gap.
      const shallowBoundary = readFileSync(join(corpus.shallow, ".git", "shallow"), "utf8").trim().split("\n");
      const shallowRepository = observeRepository(repositoryInput(box, {
        commonDirRealpath: realpathSync(join(corpus.shallow, ".git")),
        oidAlgorithm: format,
        worktrees: [{ worktreePath: corpus.shallow, worktreeFingerprint: "wtfp:shallow" }],
        shallowBoundary,
      }));
      const shallowPass = await runPass({
        box, repository: shallowRepository, observations: observeRefs(box, corpus.shallow, now), now,
        cwd: corpus.shallow, persistence: new MemoryHistoryPersistence(),
      });
      expect(shallowPass.outcome.state).toBe("gaps");
      expect(shallowPass.outcome.coverage).toEqual([{
        axis: "dag",
        state: "partial",
        reason: expect.stringContaining("shallow"),
        cause: "shallow-boundary",
        boundary: [{ algorithm: format, oid: commits.main }],
      }]);

      // Safe reads: no repository program ran, the source tree is unchanged.
      expect(existsSync(corpus.tripwireMarker)).toBe(false);
      expect(inventoryDigest(corpus)).toBe(before);
      port.assertSafeTrace();
      oldPass.port.assertSafeTrace();
      shallowPass.port.assertSafeTrace();
      console.info(`L2b roots pass ${format}`, {
        roots: outcome.roots.length,
        commits: persistence.facts.size,
        launches: port.launches.length,
        bySignal: bySignal(outcome.roots),
      });
    }

    // Uncapped PR ancestry beyond 1000 commits (plan L2b gate).
    const history = await buildHistory(box, { main: 150, pr: 1010 });
    const now = FIXTURE_TIME + 1160_000;
    const repository = observeRepository(repositoryInput(box, {
      commonDirRealpath: realpathSync(join(history.repo, ".git")),
      oidAlgorithm: "sha1",
      worktrees: [{ worktreePath: history.repo, worktreeFingerprint: "wtfp:main" }],
    }));
    const persistence = new MemoryHistoryPersistence();
    const { outcome, port } = await runPass({
      box, repository, observations: observeRefs(box, history.repo, now), now,
      cwd: history.repo, persistence,
    });
    expect(outcome.state).toBe("complete");
    // Tags are never traversal roots; the PR head is one regardless of state.
    expect(outcome.roots.every((root) => root.sources.every((source) => source.refName !== "refs/tags/pr-base"))).toBe(true);
    const total = 150 + 1010;
    expect(persistence.facts.size).toBe(total);
    const prHead = outcome.roots.find((root) => root.sources.some((source) => source.refName === "refs/pull/1/head"))!;
    const prAncestry = deriveReachability(dagOf(persistence), [{ name: "refs/pull/1/head", qualifiedOid: prHead.qualifiedOid }]);
    expect(prAncestry.get("refs/pull/1/head")!.size).toBeGreaterThan(1000);
    port.assertSafeTrace();
    console.info("L2b retained PR ancestry", {
      facts: persistence.facts.size,
      prAncestry: prAncestry.get("refs/pull/1/head")!.size,
      launches: port.launches.length,
    });

    // An unborn repository has no roots and no work at all.
    const empty = box.init(join(box.root, "l2b-empty"));
    const emptyRepository = observeRepository(repositoryInput(box, {
      commonDirRealpath: realpathSync(join(empty, ".git")),
      oidAlgorithm: "sha1",
      worktrees: [{ worktreePath: empty, worktreeFingerprint: "wtfp:empty" }],
    }));
    const emptyPass = await runPass({
      box, repository: emptyRepository, observations: [], now,
      cwd: empty, persistence: new MemoryHistoryPersistence(),
    });
    expect(emptyPass.outcome.state).toBe("complete");
    expect(emptyPass.outcome.roots).toEqual([]);
    expect(emptyPass.outcome.stats.commitsExtracted).toBe(0);
    expect(emptyPass.port.launches).toEqual([]);
  }, 240_000);

  it("expiry, deletion, recreation and force-push preserve previously ingested commits and ordered parents", async () => {
    const box = sandbox();
    const repo = box.init(join(box.root, "l2b-lifecycle"));
    const tree = (content: string) => box.git(repo, ["mktree"],
      `100644 blob ${box.git(repo, ["hash-object", "-w", "--no-filters", "--stdin"], `${content}\n`).toString().trim()}\tfile.txt\n`).toString().trim();
    const commit = (name: string, treeOid: string, parents: readonly string[]) =>
      box.git(repo, ["commit-tree", treeOid, ...parents.flatMap((parent) => ["-p", parent])], `${name}\n`).toString().trim();
    const B = commit("base", tree("base"), []);
    const F1 = commit("f1", tree("f1"), [B]);
    // Ordered merge parents: [F1, B].
    const F2 = commit("f2", tree("f2"), [F1, B]);
    const F3 = commit("f3", tree("f3"), [F2]);
    box.git(repo, ["update-ref", "refs/heads/main", B]);
    box.git(repo, ["update-ref", "refs/heads/feature", F3]);

    const repository = observeRepository(repositoryInput(box, {
      commonDirRealpath: realpathSync(join(repo, ".git")),
      oidAlgorithm: "sha1",
      worktrees: [{ worktreePath: repo, worktreeFingerprint: "wtfp:main" }],
    }));
    const persistence = new MemoryHistoryPersistence();

    // The host owns the observation log: every pass folds the WHOLE sequence so
    // deletion, recreation and force-push are separate observations of one ref.
    const observationLog: RawRefObservationDto[] = [];
    const lifecyclePass = (now: number, extra: readonly RawRefObservationDto[] = []) => {
      observationLog.push(...observeRefs(box, repo, now), ...extra);
      return runPass({
        box, repository, observations: [...observationLog], now, cwd: repo, persistence,
      });
    };

    // Pass 1: default branch + active feature branch ingest the whole DAG.
    const t1 = FIXTURE_TIME + DAY;
    const first = await lifecyclePass(t1);
    expect(first.outcome.state).toBe("complete");
    expect(first.outcome.stats.commitsExtracted).toBe(4);
    expect(persistence.facts.get(pkey(repository.clone.cloneId, F2))!.parents).toEqual([F1, B]);
    expect(rootOids(first.outcome.roots)).toEqual(new Set([B, F3]));
    expect(persistence.retainedRoots.size).toBe(2);

    // Expiry: repeated polls of the same target are not activity; 31 days later
    // the feature branch is no longer followed, yet nothing is pruned.
    const t2 = FIXTURE_TIME + 31 * DAY;
    await lifecyclePass(FIXTURE_TIME + 30 * DAY);
    const expired = await lifecyclePass(t2);
    expect(expired.outcome.stats.commitsExtracted).toBe(0);
    expect(expired.outcome.stats.commitsSkippedComplete).toBe(4);
    // The expired tip remains queryable as a previously ingested root.
    expect(rootOids(expired.outcome.roots)).toEqual(new Set([B, F3]));
    const expiredFeature = expired.outcome.roots.find((root) => root.qualifiedOid.oid === F3)!;
    expect(expiredFeature.sources.every((source) => source.signal === "previously-ingested")).toBe(true);
    expect(persistence.facts.size).toBe(4);
    expect(persistence.completion.size).toBe(4);

    // Deletion: the ref disappears; creation and deletion are separate observations
    // and the retained DAG keeps every previously ingested commit.
    box.git(repo, ["update-ref", "-d", "refs/heads/feature"]);
    const t3 = FIXTURE_TIME + 32 * DAY;
    const deleted = await lifecyclePass(t3, [
      { refName: "refs/heads/feature", oid: "", absent: true, observedAt: t3 },
    ]);
    const deletedFeature = deleted.outcome.trackedRefs.find((ref) => ref.refName === "refs/heads/feature")!;
    expect(deletedFeature.deletedAt).toBe(t3);
    expect(deletedFeature.generation).toBe(1);
    expect(deletedFeature.oid).toBeNull();
    // Old roots stay queryable independently of current reachability.
    expect(rootOids(deleted.outcome.roots)).toEqual(new Set([B, F3]));
    expect(deleted.outcome.stats.commitsExtracted).toBe(0);
    expect(persistence.facts.size).toBe(4);
    expect([...persistence.facts.values()].every((fact) => fact.extractorVersion === HISTORY_EXTRACTOR_VERSION)).toBe(true);
    const retainedMembership = deriveReachability(dagOf(persistence), [
      { name: "retained:feature", qualifiedOid: { algorithm: "sha1", oid: F3 } },
    ]);
    expect(retainedMembership.get("retained:feature")).toEqual(new Set([B, F1, F2, F3]));

    // Recreation: a separate observation generation, active again at its
    // reappearance; no extraction work, but a new retained root is recorded.
    box.git(repo, ["update-ref", "refs/heads/feature", F2]);
    const t4 = FIXTURE_TIME + 33 * DAY;
    const recreated = await lifecyclePass(t4);
    const recreatedFeature = recreated.outcome.trackedRefs.find((ref) => ref.refName === "refs/heads/feature")!;
    expect(recreatedFeature.generation).toBe(2);
    expect(recreatedFeature.oid).toBe(F2);
    expect(recreatedFeature.activity).toEqual({ activityAt: t4, signal: "observed-target-change" });
    expect(recreated.outcome.stats.commitsExtracted).toBe(0);
    expect(persistence.retainedRoots.size).toBe(3);
    expect(persistence.retainedRoots.get(pkey(repository.clone.cloneId, F2))!.firstSignal).toBe("active-window");

    // Force-push: a rewritten tip ingests the new chain while the old chain and
    // its ordered parents remain retained; membership is derived, never a
    // persisted commit × branch edge.
    const G1 = commit("g1", tree("g1"), [B]);
    const G2 = commit("g2", tree("g2"), [G1, B]);
    box.git(repo, ["update-ref", "refs/heads/feature", G2]);
    const t5 = FIXTURE_TIME + 34 * DAY;
    const forced = await lifecyclePass(t5);
    expect(forced.outcome.stats.commitsExtracted).toBe(2);
    expect(persistence.facts.size).toBe(6);
    expect(persistence.completion.size).toBe(6);
    // The old chain is intact, ordered parents included.
    expect(persistence.facts.get(pkey(repository.clone.cloneId, F3))!.parents).toEqual([F2]);
    expect(persistence.facts.get(pkey(repository.clone.cloneId, F2))!.parents).toEqual([F1, B]);
    expect(persistence.facts.get(pkey(repository.clone.cloneId, G2))!.parents).toEqual([G1, B]);
    expect(persistence.retainedRoots.size).toBe(4);
    // Derived branch membership from the current refs only covers the new chain;
    // the old chain remains reachable through its retained roots.
    const current = deriveReachability(dagOf(persistence), [
      { name: "refs/heads/feature", qualifiedOid: { algorithm: "sha1", oid: G2 } },
      { name: "retained:f3", qualifiedOid: { algorithm: "sha1", oid: F3 } },
    ]);
    expect(current.get("refs/heads/feature")).toEqual(new Set([B, G1, G2]));
    expect(current.get("retained:f3")).toEqual(new Set([B, F1, F2, F3]));
    // The bounded, versioned, invalidatable derived cache recomputes after invalidation.
    const cache = new DerivedReachabilityCache(dagOf(persistence), [
      { name: "refs/heads/feature", qualifiedOid: { algorithm: "sha1", oid: G2 } },
    ], { dagVersion: 6, refsVersion: 5 });
    expect(cache.membership("refs/heads/feature")).toEqual(new Set([B, G1, G2]));
    cache.invalidate();
    expect(cache.membership("refs/heads/feature")).toEqual(new Set([B, G1, G2]));
    // No persistent commit × branch edge: the port only ever received commit
    // facts, complete-ancestry checkpoints and retained roots.
    expect(new Set(persistence.recordKinds)).toEqual(new Set(["commit-fact", "completion", "retained-root"]));

    // A missing object is an explicit coverage gap, never fabricated retention:
    // the retained facts stay queryable even after the source object is gone.
    const objectPath = join(repo, ".git", "objects", F3.slice(0, 2), F3.slice(2));
    expect(existsSync(objectPath)).toBe(true);
    rmSync(objectPath);
    const t6 = FIXTURE_TIME + 35 * DAY;
    const missing = await lifecyclePass(t6);
    expect(missing.outcome.state).toBe("gaps");
    expect(missing.outcome.coverage).toEqual([{
      axis: "dag",
      state: "unavailable",
      reason: expect.stringContaining(F3),
      cause: "missing-object",
      missing: [{ algorithm: "sha1", oid: F3 }],
    }]);
    // Nothing was deleted and no completeness was invented.
    expect(persistence.facts.size).toBe(6);
    expect(missing.outcome.stats.commitsExtracted).toBe(0);
    for (const pass of [first, expired, deleted, recreated, forced, missing]) pass.port.assertSafeTrace();
    console.info("L2b ref lifecycle", {
      facts: persistence.facts.size,
      completion: persistence.completion.size,
      retainedRoots: [...persistence.retainedRoots.values()].map((root) => root.oid.slice(0, 8)),
    });
  }, 120_000);

  it("a known partial OID resumes while a complete unchanged ancestry produces no extraction work", async () => {
    const box = sandbox();
    const history = await buildHistory(box, { main: 257, pr: 17 });
    const total = 257 + 17;
    const repository = observeRepository(repositoryInput(box, {
      commonDirRealpath: realpathSync(join(history.repo, ".git")),
      oidAlgorithm: "sha1",
      worktrees: [{ worktreePath: history.repo, worktreeFingerprint: "wtfp:main" }],
    }));
    const persistence = new MemoryHistoryPersistence();
    const now = FIXTURE_TIME + 300_000;
    const observations = observeRefs(box, history.repo, now);

    // Interrupted pass: durable acknowledgement stops after 100 checkpoints. The
    // 101st commit is a KNOWN OID (its fact was received) but not a complete one.
    persistence.failCompletionAfter = 100;
    await expect(runPass({ box, repository, observations, now, cwd: history.repo, persistence }))
      .rejects.toThrow(/durable acknowledgement interrupted/);
    expect(persistence.completion.size).toBe(100);
    expect(persistence.facts.size).toBe(101);

    // Resume: the known-but-partial OID is not a traversal stop and not a
    // completion; only the checkpointed 100 are skipped, the rest re-extract.
    persistence.failCompletionAfter = undefined;
    const resumed = await runPass({ box, repository, observations, now, cwd: history.repo, persistence });
    expect(resumed.outcome.state).toBe("complete");
    expect(resumed.outcome.stats.commitsExtracted).toBe(total - 100);
    expect(resumed.outcome.stats.commitsSkippedComplete).toBe(100);
    expect(persistence.facts.size).toBe(total);
    expect(persistence.completion.size).toBe(total);
    resumed.port.assertSafeTrace();
    console.info("L2b interrupted resume", {
      reextracted: resumed.outcome.stats.commitsExtracted,
      skippedComplete: resumed.outcome.stats.commitsSkippedComplete,
      launches: resumed.port.launches.length,
      counts: resumed.port.counts(),
    });

    // No-change pass: a complete unchanged ancestry extracts zero commits and
    // launches nothing beyond the two discovery attestations.
    const noChange = await runPass({ box, repository, observations, now, cwd: history.repo, persistence });
    expect(noChange.outcome.state).toBe("complete");
    expect(noChange.outcome.stats.commitsExtracted).toBe(0);
    expect(noChange.outcome.stats.commitsSkippedComplete).toBe(total);
    expect(noChange.port.launches.length).toBe(2);
    expect(noChange.port.counts()).toEqual({ "rev-list-count": 1, "rev-list": 1, "cat-file": 0, "diff-tree": 0 });
    noChange.port.assertSafeTrace();
    console.info("L2b no-change", {
      extracted: 0,
      skippedComplete: noChange.outcome.stats.commitsSkippedComplete,
      launches: noChange.port.launches.length,
    });

    // A known OID alone never means complete ancestry: equating fact receipt with
    // completion would have skipped the 101st commit on resume.
    expect(persistence.facts.size).toBeGreaterThan(persistence.completion.size - total + 100);
  }, 240_000);

  it("MAJEUR 1: a child checkpointed before its parent never resumes as complete ancestry under a shallow graft", async () => {
    const box = sandbox();
    const repo = box.init(join(box.root, "l2b-m1"));
    const tree = (content: string) => box.git(repo, ["mktree"],
      `100644 blob ${box.git(repo, ["hash-object", "-w", "--no-filters", "--stdin"], `${content}\n`).toString().trim()}\tfile.txt\n`).toString().trim();
    const commit = (name: string, treeOid: string, parents: readonly string[]) =>
      box.git(repo, ["commit-tree", treeOid, ...parents.flatMap((parent) => ["-p", parent])], `${name}\n`).toString().trim();
    const B = commit("parent", tree("parent"), []);
    const A = commit("child", tree("child"), [B]);
    box.git(repo, ["update-ref", "refs/heads/main", A]);
    const repository = observeRepository(repositoryInput(box, {
      commonDirRealpath: realpathSync(join(repo, ".git")),
      oidAlgorithm: "sha1",
      worktrees: [{ worktreePath: repo, worktreeFingerprint: "wtfp:m1" }],
    }));
    const persistence = new MemoryHistoryPersistence();
    const now = FIXTURE_TIME + DAY;
    const observations = observeRefs(box, repo, now);

    // Interruption after the child's checkpoint, before the parent's: the
    // child looks complete while its parent is not durable.
    persistence.failCompletionAfter = 1;
    await expect(runPass({ box, repository, observations, now, cwd: repo, persistence }))
      .rejects.toThrow(/durable acknowledgement interrupted/);
    const cloneId = repository.clone.cloneId;
    expect(persistence.completion.has(pkey(cloneId, A))).toBe(true);
    expect(persistence.completion.has(pkey(cloneId, B))).toBe(false);
    persistence.failCompletionAfter = undefined;

    // The parent object then leaves the SAME clone: resuming with the clone's
    // own checkpoints must surface an explicit gap — never complete ancestry
    // with empty coverage.
    const objectPath = join(repo, ".git", "objects", B.slice(0, 2), B.slice(2));
    expect(existsSync(objectPath)).toBe(true);
    rmSync(objectPath);
    const resumed = await runPass({
      box, repository, observations: observeRefs(box, repo, now + DAY),
      now: now + DAY, cwd: repo, persistence,
    });
    expect(resumed.outcome.state).toBe("gaps");
    expect(resumed.outcome.coverage.length).toBeGreaterThan(0);
    // A real Git launch happened and is reported (never zeroed on a gap).
    expect(resumed.port.launches.length).toBeGreaterThan(0);
    expect(resumed.outcome.stats.gitLaunches).toBeGreaterThan(0);
    // Nothing fabricated the missing parent as complete.
    expect(persistence.completion.has(pkey(cloneId, B))).toBe(false);
  }, 120_000);

  it("MAJEUR 2: the walk ingests the observed OID even when its ref moved before the launches", async () => {
    const box = sandbox();
    const repo = box.init(join(box.root, "l2b-m2"));
    const tree = (content: string) => box.git(repo, ["mktree"],
      `100644 blob ${box.git(repo, ["hash-object", "-w", "--no-filters", "--stdin"], `${content}\n`).toString().trim()}\tfile.txt\n`).toString().trim();
    const commit = (name: string, treeOid: string, parents: readonly string[]) =>
      box.git(repo, ["commit-tree", treeOid, ...parents.flatMap((parent) => ["-p", parent])], `${name}\n`).toString().trim();
    const B = commit("base-a", tree("base-a"), []);
    const A = commit("tip-a", tree("tip-a"), [B]);
    // A same-size decoy history: a count attestation cannot tell them apart.
    const D = commit("base-c", tree("base-c"), []);
    const C = commit("tip-c", tree("tip-c"), [D]);
    box.git(repo, ["update-ref", "refs/heads/main", A]);
    const repository = observeRepository(repositoryInput(box, {
      commonDirRealpath: realpathSync(join(repo, ".git")),
      oidAlgorithm: "sha1",
      worktrees: [{ worktreePath: repo, worktreeFingerprint: "wtfp:m2" }],
    }));
    const now = FIXTURE_TIME + 100 * DAY;
    const observations = observeRefs(box, repo, now);
    // main, observed on A, moves to C before the engine launches Git.
    box.git(repo, ["update-ref", "refs/heads/main", C]);

    const persistence = new MemoryHistoryPersistence();
    const { outcome, port } = await runPass({ box, repository, observations, now, cwd: repo, persistence });
    expect(outcome.state).toBe("complete");
    // The observed history is ingested — not the moved ref's same-size decoy.
    expect(new Set([...persistence.facts.values()].map((fact) => fact.oid))).toEqual(new Set([A, B]));
    expect(new Set([...persistence.retainedRoots.values()].map((root) => root.oid))).toEqual(new Set([A]));
    // The walk named the OID, never the mobile ref name.
    const revList = port.launches.find((launch) => launch.purpose === "rev-list");
    expect(revList).toBeDefined();
    expect(revList!.args).toContain(A);
    expect(revList!.args).not.toContain("refs/heads/main");
  }, 120_000);

  it("MAJEUR 3: a root ingested then interrupted stays resumable by OID after its ref is deleted", async () => {
    const box = sandbox();
    const repo = box.init(join(box.root, "l2b-m3"));
    const tree = (content: string) => box.git(repo, ["mktree"],
      `100644 blob ${box.git(repo, ["hash-object", "-w", "--no-filters", "--stdin"], `${content}\n`).toString().trim()}\tfile.txt\n`).toString().trim();
    const commit = (name: string, treeOid: string, parents: readonly string[]) =>
      box.git(repo, ["commit-tree", treeOid, ...parents.flatMap((parent) => ["-p", parent])], `${name}\n`).toString().trim();
    const B = commit("parent", tree("parent"), []);
    const A = commit("child", tree("child"), [B]);
    box.git(repo, ["update-ref", "refs/heads/main", A]);
    const repository = observeRepository(repositoryInput(box, {
      commonDirRealpath: realpathSync(join(repo, ".git")),
      oidAlgorithm: "sha1",
      worktrees: [{ worktreePath: repo, worktreeFingerprint: "wtfp:m3" }],
    }));
    const persistence = new MemoryHistoryPersistence();
    const now = FIXTURE_TIME + DAY;
    const observationLog: RawRefObservationDto[] = [...observeRefs(box, repo, now)];

    // Interruption during the first extraction: the root must already be
    // retained, not only on a complete pass.
    persistence.failCompletionAfter = 0;
    await expect(runPass({ box, repository, observations: observationLog, now, cwd: repo, persistence }))
      .rejects.toThrow(/durable acknowledgement interrupted/);
    expect(persistence.retainedRoots.has(pkey(repository.clone.cloneId, A))).toBe(true);
    persistence.failCompletionAfter = undefined;

    // The branch is then deleted: the resume must still find work by OID —
    // never zero roots, zero launches and a fabricated complete state.
    box.git(repo, ["update-ref", "-d", "refs/heads/main"]);
    const later = now + DAY;
    observationLog.push(...observeRefs(box, repo, later));
    observationLog.push({ refName: "refs/heads/main", oid: "", absent: true, observedAt: later });
    const repositoryAfter = observeRepository(repositoryInput(box, {
      commonDirRealpath: realpathSync(join(repo, ".git")),
      oidAlgorithm: "sha1",
      worktrees: [{ worktreePath: repo, worktreeFingerprint: "wtfp:m3" }],
    }));
    const resumed = await runPass({
      box, repository: repositoryAfter, observations: observationLog, now: later, cwd: repo, persistence,
    });
    expect(rootOids(resumed.outcome.roots)).toEqual(new Set([A]));
    expect(resumed.outcome.state).toBe("complete");
    expect(resumed.port.launches.length).toBeGreaterThan(0);
    expect(persistence.facts.has(pkey(repositoryAfter.clone.cloneId, A))).toBe(true);
    expect(persistence.facts.has(pkey(repositoryAfter.clone.cloneId, B))).toBe(true);
    expect(persistence.completion.has(pkey(repositoryAfter.clone.cloneId, B))).toBe(true);
  }, 120_000);

  it("repeated observation is not activity and clones with the same h2a fingerprint remain distinct while linked worktrees share common-dir identity", async () => {
    // Repeated observation is not activity: polling the same target never
    // refreshes the activity date, so the 30-day window expires on the last real
    // work, not on the last poll.
    const oid = `1f${"0".repeat(38)}`;
    const other = `2e${"0".repeat(38)}`;
    const guarded = trackRef("refs/heads/guarded", [
      { refName: "refs/heads/guarded", oid, observedAt: FIXTURE_TIME, tipCommitterUnixSeconds: 1_700_000_000 },
      { refName: "refs/heads/guarded", oid, observedAt: FIXTURE_TIME + 10 * DAY },
      { refName: "refs/heads/guarded", oid, observedAt: FIXTURE_TIME + 20 * DAY },
      { refName: "refs/heads/guarded", oid, observedAt: FIXTURE_TIME + 29 * DAY },
    ]);
    expect(guarded.activity).toEqual({ activityAt: FIXTURE_TIME, signal: "bootstrap-committer-time" });
    expect(guarded.generation).toBe(1);
    const selection = selectHistoryRoots({
      trackedRefs: [guarded],
      worktreeHeads: [],
      defaultBranch: "refs/heads/main",
      retainedRoots: [],
      now: FIXTURE_TIME + ACTIVITY_WINDOW_DAYS * DAY + 1,
      oidAlgorithm: "sha1",
    });
    expect(selection).toEqual([]);
    // Control: an observed target change is activity and stays inside the window.
    const changed = trackRef("refs/heads/changed", [
      { refName: "refs/heads/changed", oid, observedAt: FIXTURE_TIME, tipCommitterUnixSeconds: 1_700_000_000 },
      { refName: "refs/heads/changed", oid: other, observedAt: FIXTURE_TIME + 15 * DAY },
    ]);
    expect(changed.activity).toEqual({ activityAt: FIXTURE_TIME + 15 * DAY, signal: "observed-target-change" });
    const changedSelection = selectHistoryRoots({
      trackedRefs: [changed],
      worktreeHeads: [],
      defaultBranch: "refs/heads/main",
      retainedRoots: [],
      now: FIXTURE_TIME + ACTIVITY_WINDOW_DAYS * DAY + 1,
      oidAlgorithm: "sha1",
    });
    expect(rootOids(changedSelection)).toEqual(new Set([other]));

    // Two clones with the same h2a project fingerprint under different realpaths
    // remain distinct clones: the fingerprint is never the clone key.
    const synthetic = (realpath: string): RepositoryObservationInput => ({
      hostScope: "l2b-guard",
      commonDirRealpath: realpath,
      commonDirProjectFingerprint: "ws:same-project",
      oidAlgorithm: "sha1",
      worktrees: [{
        worktreePath: `${realpath}/..`,
        gitDir: realpath,
        worktreeFingerprint: `wtfp:${basename(realpath)}`,
        head: { kind: "detached", oid },
      }],
    });
    const cloneA = observeRepository(synthetic("/srv/clone-a/.git"));
    const cloneB = observeRepository(synthetic("/srv/clone-b/.git"));
    expect(cloneA.clone.cloneId).toMatch(/^clone:/);
    expect(cloneA.clone.cloneId).not.toBe(cloneB.clone.cloneId);
    expect(cloneA.worktrees[0]!.identity.cloneId).not.toBe(cloneB.worktrees[0]!.identity.cloneId);

    // Linked worktrees of one common dir share the clone identity while each
    // keeps an isolated worktree identity and its own HEAD observation.
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const repository = observeRepository(repositoryInput(box, {
      commonDirRealpath: realpathSync(join(corpus.repo, ".git")),
      oidAlgorithm: "sha1",
      worktrees: [
        { worktreePath: corpus.repo, worktreeFingerprint: "wtfp:main" },
        { worktreePath: corpus.linked, worktreeFingerprint: "wtfp:linked" },
        { worktreePath: corpus.detached, worktreeFingerprint: "wtfp:detached" },
        { worktreePath: corpus.sparse, worktreeFingerprint: "wtfp:sparse" },
      ],
    }));
    const cloneIds = new Set(repository.worktrees.map((worktree) => worktree.identity.cloneId));
    expect(cloneIds).toEqual(new Set([repository.clone.cloneId]));
    expect(new Set(repository.worktrees.map((worktree) => worktree.identity.worktreeId)).size).toBe(4);
    // Checkout isolation: two worktrees at the same commit stay separate
    // observations; immutable analyses are shared through the clone, never through
    // a worktree-specific identity.
    const headsAtMain = repository.worktrees.filter((worktree) =>
      (worktree.head.kind === "branch" && worktree.head.refName === "refs/heads/main") ||
      (worktree.head.kind === "detached" && worktree.head.oid === corpus.commits.main));
    expect(headsAtMain.length).toBe(2);
    expect(new Set(headsAtMain.map((worktree) => worktree.identity.worktreeId)).size).toBe(2);
  }, 120_000);
});
