// L2a — Streaming Native Git Reads (plan/09 L2a; spec/SPEC_LIVE_GIT_INDEXING.md
// §6, §13). Test-first: this file is written before engram-live/git-stream.ts
// and engram-live/git-protocol.ts exist, and must be observed RED first.
// Review round (REVIEW-L2a-sol): every test added for the two blocking
// findings is likewise observed RED against the rejected diff first.
//
// This test is NOT part of the neutral test closure of tests/live-neutrality.test.ts:
// it exercises the injected port against the L0 corpus (tests/helpers) and the
// legacy root extractor, not only the @sentropic/engram-live package.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCorpus, buildHistory, detectGitCapabilities, inventoryDigest,
  LiveGitSandbox, normalizeOracle, recipe,
} from "./helpers/live-git-fixtures.js";
import { extractGit } from "../src/extract-git.js";
import {
  DEFAULT_COMMIT_BATCH, DIFF_RECORD_STRUCTURAL_BYTES, MAX_DIFF_BLOCK_BYTES, MAX_FIELD_BYTES,
  DiffTreeParser, GitProtocolError, diffTreeArguments, revListArguments,
} from "../engram-live/git-protocol.js";
import {
  GitStreamError,
  identityIsoDate,
  streamGitHistory,
  type GitLaunch,
  type GitProcess,
  type GitProcessPort,
  type StreamedCommit,
  type StreamedFileChange,
  type GitStreamOptions,
  type GitStreamStats,
} from "../engram-live/git-stream.js";

type Purpose = GitLaunch["purpose"];
interface LaunchRecord {
  purpose: Purpose;
  args: string[];
  writes: number;
  writeBytes: number;
}
interface PortHooks {
  /** Hold all stdout of the Nth launch of a purpose until released. */
  readonly notch?: { purpose: Purpose; occurrence: number };
  /** Truncate the whole stdout of the Nth launch: keep the first `keep` bytes, or drop the last `cut` bytes. */
  readonly truncate?: { purpose: Purpose; occurrence: number; cut?: number; keep?: number };
  /** Deliver every chunk of the Nth launch but withhold its end until released. */
  readonly holdEnd?: { purpose: Purpose; occurrence: number };
}

// Mirrors the safe-launch conventions of tests/helpers/live-process-trace.ts:
// no system/global config, optional locks off, no lazy fetch, no replace refs,
// no prompt; every argv is built by the neutral protocol and already carries
// --no-optional-locks/-c core.fsmonitor=false and, for diff-tree, the
// --no-ext-diff/--no-textconv pair.
class SandboxGitPort implements GitProcessPort {
  readonly launches: LaunchRecord[] = [];
  readonly tracePath: string;
  maxActive = 0;
  private active = 0;
  private readonly box: LiveGitSandbox;
  private readonly hooks: PortHooks;
  private readonly occurrence: Record<string, number> = {};
  private readonly holds: (() => void)[] = [];
  private holdReleased = false;
  private static traceCount = 0;

  constructor(box: LiveGitSandbox, hooks: PortHooks = {}) {
    this.box = box;
    this.hooks = hooks;
    // One Trace2 file per port: GIT_TRACE2_EVENT appends, so a shared path
    // would accumulate the starts of earlier passes in this same sandbox.
    SandboxGitPort.traceCount += 1;
    this.tracePath = join(box.root, `l2a-trace2-${SandboxGitPort.traceCount}.jsonl`);
  }

  releaseNotch(): void {
    this.holdReleased = true;
    for (const release of this.holds.splice(0)) release();
  }

  async start(launch: GitLaunch): Promise<GitProcess> {
    const key = launch.purpose;
    this.occurrence[key] = (this.occurrence[key] ?? 0) + 1;
    const occurrence = this.occurrence[key];
    const record: LaunchRecord = { purpose: launch.purpose, args: [...launch.args], writes: 0, writeBytes: 0 };
    this.launches.push(record);
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
    const exited = new Promise<{ code: number; stderr: Uint8Array }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        self.active -= 1;
        resolve({ code: code ?? -1, stderr: Buffer.concat(stderr) });
      });
    });
    const hookMatches = (hook: { purpose: Purpose; occurrence: number } | undefined) =>
      hook !== undefined && hook.purpose === launch.purpose && hook.occurrence === occurrence;
    // Eager, paused capture: listeners are attached at spawn — so a child
    // that exits before the first pull still records its end — but the pipe
    // only flows while the consumer pulls one chunk at a time. A slow or
    // stalled consumer can therefore never make this port buffer a whole
    // response (review L2a-sol, finding 7).
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
    const onDone = (): void => {
      // holdEnd delivers every chunk but parks the terminal event until
      // release: the child has finished, the consumer just cannot observe
      // the end of its output yet.
      if (hookMatches(self.hooks.holdEnd) && !self.holdReleased) {
        self.holds.push(finish);
        return;
      }
      finish();
    };
    child.stdout.once("end", onDone);
    child.stdout.once("close", onDone);
    child.stdout.once("error", onDone);
    const captureWhole = async (): Promise<Buffer> => {
      // Whole-stream capture is required to cut at an exact byte offset;
      // only ever used on small histories, never in a memory-bound pass.
      // The paused pipe must be resumed to actually drain it.
      while (!ended) {
        child.stdout.resume();
        await new Promise<void>((resolve) => wakeups.push(resolve));
      }
      return Buffer.concat(chunks);
    };
    const stdout = (async function* deliver(self: SandboxGitPort): AsyncGenerator<Uint8Array> {
      if (hookMatches(self.hooks.notch)) {
        await new Promise<void>((resolve) => self.holds.push(resolve));
      }
      if (hookMatches(self.hooks.truncate)) {
        const bytes = await captureWhole();
        const hook = self.hooks.truncate!;
        const limit = hook.keep !== undefined
          ? Math.max(0, Math.min(hook.keep, bytes.length))
          : Math.max(0, bytes.length - (hook.cut ?? 0));
        yield bytes.subarray(0, limit);
        return;
      }
      for (;;) {
        while (chunks.length === 0 && !ended) {
          // For a holdEnd launch the terminal event is parked in onDone,
          // so once every chunk is delivered this pull simply stays parked
          // until release: data flows, only the end is withheld.
          child.stdout.resume();
          await new Promise<void>((resolve) => wakeups.push(resolve));
        }
        if (chunks.length === 0) return;
        yield chunks.shift()!;
      }
    })(this);
    const self = this;
    child.stdin.on("error", () => undefined);
    return {
      stdout,
      stdin: {
        async write(chunk: Uint8Array): Promise<void> {
          record.writes += 1;
          record.writeBytes += chunk.byteLength;
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
      expect(launch.args).toContain("--no-optional-locks");
      expect(launch.args).toContain("core.fsmonitor=false");
      if (launch.purpose === "diff-tree") {
        expect(launch.args).toContain("--no-ext-diff");
        expect(launch.args).toContain("--no-textconv");
      }
    }
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

/**
 * Scripted port: protocol-valid responses for the whole pass, delivered in
 * bounded chunks like a real child, with no repository involved. Used where
 * the property under test is the reader's own bound, not Git's output.
 */
class ScriptedGitPort implements GitProcessPort {
  readonly purposes: Purpose[] = [];
  constructor(private readonly respond: (launch: GitLaunch) => Buffer) {}

  async start(launch: GitLaunch): Promise<GitProcess> {
    this.purposes.push(launch.purpose);
    const response = this.respond(launch);
    const stdout = (async function* (): AsyncGenerator<Uint8Array> {
      for (let offset = 0; offset < response.length; offset += 16384) {
        yield response.subarray(offset, Math.min(offset + 16384, response.length));
      }
    })();
    return {
      stdout,
      stdin: { async write(): Promise<void> {}, async close(): Promise<void> {} },
      exit: Promise.resolve({ code: 0, stderr: new Uint8Array(0) }),
      async abort(): Promise<void> {},
    };
  }
}

async function drain(stream: AsyncGenerator<StreamedCommit, GitStreamStats>): Promise<{ records: StreamedCommit[]; stats: GitStreamStats }> {
  const records: StreamedCommit[] = [];
  for (;;) {
    const step = await stream.next();
    if (step.done) return { records, stats: step.value };
    records.push(step.value);
  }
}

function options(box: LiveGitSandbox, port: GitProcessPort, cwd: string, roots: string[], extra: Partial<GitStreamOptions> = {}): GitStreamOptions {
  return { port, cwd, roots, ...extra };
}

async function waitForIdle(ms = 150): Promise<void> {
  // A timer yields a full event-loop turn, so child stdout/close callbacks
  // are actually processed between polls; a synchronous block would starve
  // them and stall the very stream this helper is waiting on.
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// — Serialization of streamed change records into the frozen native Git
// oracle formats (NUL-delimited, latin1-comparable with recipe.oracle).
function nameStatusBytes(changes: readonly StreamedFileChange[]): Buffer {
  const parts: Buffer[] = [];
  for (const change of changes) {
    parts.push(Buffer.from(`${change.status}\0`));
    if (change.previousPath !== null) parts.push(Buffer.from(change.previousPath), Buffer.from([0]));
    parts.push(Buffer.from(change.path), Buffer.from([0]));
  }
  return Buffer.concat(parts);
}

function numstatBytes(changes: readonly StreamedFileChange[]): Buffer {
  const parts: Buffer[] = [];
  for (const change of changes) {
    const added = change.added === null ? "-" : String(change.added);
    const deleted = change.deleted === null ? "-" : String(change.deleted);
    parts.push(Buffer.from(`${added}\t${deleted}\t`));
    if (change.previousPath !== null) {
      parts.push(Buffer.from([0]), Buffer.from(change.previousPath), Buffer.from([0]), Buffer.from(change.path), Buffer.from([0]));
    } else {
      parts.push(Buffer.from(change.path), Buffer.from([0]));
    }
  }
  return Buffer.concat(parts);
}

function rawRecordBytes(change: StreamedFileChange): Buffer {
  const head = `:${change.oldMode} ${change.newMode} ${change.oldOid} ${change.newOid} ${change.status}\0`;
  const parts: Buffer[] = [Buffer.from(head)];
  if (change.previousPath !== null) parts.push(Buffer.from(change.previousPath), Buffer.from([0]));
  parts.push(Buffer.from(change.path), Buffer.from([0]));
  return Buffer.concat(parts);
}

function diffOf(commit: StreamedCommit, parentIndex: number): readonly StreamedFileChange[] {
  const entry = commit.parentDiffs.find((diff) => diff.parentIndex === parentIndex);
  return entry === undefined ? [] : entry.files;
}

const historyRoots = ["refs/heads/main", "refs/pull/1/head"];

describe("L2a streaming native Git reads", () => {
  it("reads more than 1000 commits with subprocess count bounded by batches rather than commits", async () => {
    const box = sandbox();
    const history = await buildHistory(box, { main: 1200, pr: 60 });
    const port = new SandboxGitPort(box);
    const { records, stats } = await drain(streamGitHistory(options(box, port, history.repo, historyRoots)));

    expect(records).toHaveLength(1260);
    expect(new Set(records.map((record) => record.oid)).size).toBe(1260);
    // Every record carries complete metadata AND changed files — a
    // metadata-only benchmark is insufficient (plan L2a gate).
    for (const record of records) {
      expect(record.tree).toMatch(/^[0-9a-f]{40,64}$/);
      expect(record.author.email).toBe("l0@example.invalid");
      expect(record.subject.length).toBeGreaterThan(0);
      expect(record.message.byteLength).toBeGreaterThan(0);
      const files = diffOf(record, record.parents.length === 0 ? -1 : 0);
      expect(files, `commit ${record.oid} has no changed files`).toHaveLength(1);
      expect(Buffer.from(files[0].path).toString("latin1")).toBe("history.txt");
      expect(files[0].added).not.toBeNull();
      expect(files[0].deleted).not.toBeNull();
      expect((files[0].added ?? 0) + (files[0].deleted ?? 0)).toBeGreaterThan(0);
    }

    const counts = port.counts();
    const launches = port.launches.length;
    // LIVE §13: <= 8 + 3 * ceil(C / 1000) per pass; batches, not commits.
    expect(launches).toBeLessThanOrEqual(8 + 3 * Math.ceil(records.length / 1000));
    // The exact batch formula: one rev-list --count attestation, one
    // streaming rev-list, then cat-file and diff-tree once per 1000-commit
    // batch. A per-commit design would need >1260.
    expect(counts).toEqual({ "rev-list-count": 1, "rev-list": 1, "cat-file": 2, "diff-tree": 2 });
    expect(port.maxActive).toBeLessThanOrEqual(4);
    port.assertSafeTrace();

    // No-change pass: zero already-complete commits are re-extracted, and a
    // C=0 pass stays within the fixed <=8 allowance (LIVE §13).
    const port2 = new SandboxGitPort(box);
    const knownComplete = new Set(records.map((record) => record.oid));
    const second = await drain(streamGitHistory(options(box, port2, history.repo, historyRoots, { knownComplete })));
    expect(second.records).toEqual([]);
    expect(second.stats.commitsExtracted).toBe(0);
    expect(second.stats.commitsSkippedComplete).toBe(1260);
    expect(port2.launches.length).toBe(2);
    expect(port2.counts()).toEqual({ "rev-list-count": 1, "rev-list": 1, "cat-file": 0, "diff-tree": 0 });

    console.info("L2a >1000 commits", {
      commits: records.length,
      launches,
      counts,
      maxActive: port.maxActive,
      batches: stats.batches,
      rssBytes: process.memoryUsage().rss,
    });
  }, 120_000);

  it("streamed metadata and changed files match the legacy extractor on its supported domain", async () => {
    const box = sandbox();
    const history = await buildHistory(box, recipe.history.routine);
    const port = new SandboxGitPort(box);
    const { records } = await drain(streamGitHistory(options(box, port, history.repo, historyRoots)));

    // The supported domain of the legacy extractor: single-parent or root
    // commits, text-only changes, ASCII paths and messages. The generated
    // history is exactly that domain; assert the precondition instead of
    // silently widening the comparison.
    for (const record of records) {
      expect(record.parents.length).toBeLessThanOrEqual(1);
      for (const change of diffOf(record, record.parents.length === 0 ? -1 : 0)) {
        expect(change.added).not.toBeNull();
        expect(change.deleted).not.toBeNull();
        expect(change.previousPath).toBeNull();
      }
    }

    const legacy = extractGit(history.repo, { branches: historyRoots, observedAt: "2026-10-12T00:00:00.000Z" });
    const legacyCommits = new Map(
      legacy.nodes.filter((node) => node.node_type === "Commit").map((node) => [node.sha ?? "", node]),
    );
    expect(legacyCommits.size).toBe(recipe.history.routine.main + recipe.history.routine.pr);
    expect(records.map((record) => record.oid).sort()).toEqual([...legacyCommits.keys()].sort());

    const legacyModifies = new Map<string, { file_path: string; added: number; deleted: number }[]>();
    for (const edge of legacy.edges) {
      if (edge.relation !== "MODIFIES") continue;
      const list = legacyModifies.get(edge.source) ?? [];
      list.push({ file_path: edge.file_path ?? "", added: edge.added ?? 0, deleted: edge.deleted ?? 0 });
      legacyModifies.set(edge.source, list);
    }
    // MODIFIES edges are keyed by the legacy commit node id (commitId of the sha).
    const commitNodeId = (sha: string): string => legacyCommits.get(sha)?.id ?? "";

    for (const record of records) {
      const node = legacyCommits.get(record.oid);
      expect(node, `legacy node for ${record.oid}`).toBeDefined();
      expect(record.parents).toEqual(node?.parents ?? []);
      expect(`${record.author.name} <${record.author.email}>`).toBe(node?.author ?? "");
      expect(identityIsoDate(record.author)).toBe(node?.authoredAt ?? "");
      expect(record.subject).toBe(node?.message_summary ?? "");
      // The legacy extractor measures `%B` after trimming; on the ASCII
      // domain that is the streamed message with its trailing LF removed.
      const messageText = Buffer.from(record.message).toString("utf8");
      expect(messageText.trim().length).toBe(node?.message_length ?? -1);
      const files = diffOf(record, record.parents.length === 0 ? -1 : 0);
      const streamed = files
        .map((change) => ({ file_path: Buffer.from(change.path).toString("utf8"), added: change.added ?? 0, deleted: change.deleted ?? 0 }))
        .sort((a, b) => a.file_path.localeCompare(b.file_path));
      const sha = record.oid;
      const old = (legacyModifies.get(commitNodeId(record.oid)) ?? [])
        .map((entry) => ({ file_path: entry.file_path, added: entry.added, deleted: entry.deleted }))
        .sort((a, b) => a.file_path.localeCompare(b.file_path));
      expect(streamed, `changed files of ${sha}`).toEqual(old);
    }
    port.assertSafeTrace();
  }, 180_000);

  it("native Git oracle preserves root and merge diffs, binaries, modes, renames and path bytes", async () => {
    const box = sandbox();
    const capabilities = detectGitCapabilities(box);
    const roots = [
      "refs/heads/main", "refs/heads/topic", "refs/heads/joined-roots",
      "refs/pull/1/head", "refs/pull/2/head", "refs/pull/3/head",
    ];
    for (const format of capabilities.objectFormats) {
      for (const refs of capabilities.refFormats) {
        const corpus = buildCorpus(box, format, refs);
        const before = inventoryDigest(corpus);
        const port = new SandboxGitPort(box);
        const { records } = await drain(streamGitHistory(options(box, port, corpus.repo, roots)));

        const byOid = new Map(records.map((record) => [record.oid, record]));
        // Nine reachable commits: the eight named ones plus "unrelated",
        // pulled in as the second parent of joined-roots.
        expect(records).toHaveLength(9);
        for (const name of ["main", "octopus", "merge", "left", "right", "third", "root", "unrelated"]) {
          expect(byOid.has(corpus.commits[name]), `commit ${name}`).toBe(true);
        }

        // Root commit: full tree as added paths, exact bytes, modes and kinds.
        const root = byOid.get(corpus.commits.root)!;
        expect(root.parents).toEqual([]);
        const rootFiles = diffOf(root, -1);
        expect(nameStatusBytes(rootFiles).toString("latin1")).toBe(recipe.oracle.rootNames);
        const byPath = (files: readonly StreamedFileChange[], path: string) =>
          files.find((change) => Buffer.from(change.path).toString("latin1") === path);
        const link = byPath(rootFiles, "link")!;
        expect(link.newMode).toBe("120000");
        expect(link.newOid).toBe(corpus.blobs.link);
        const script = byPath(rootFiles, "run.sh")!;
        expect(script.newMode).toBe("100644");
        expect(script.newOid).toBe(corpus.blobs.script);
        const gitlink = byPath(rootFiles, "vendor/submodule")!;
        expect(gitlink.newMode).toBe("160000");
        expect(gitlink.newOid).toBe(corpus.commits.unrelated);
        // Lossless path bytes: the raw non-UTF-8 path and the tab/newline path.
        const rawPath = Buffer.from(recipe.rawPathHex, "hex");
        expect(rootFiles.some((change) => Buffer.from(change.path).equals(rawPath))).toBe(true);
        expect(rootFiles.some((change) => Buffer.from(change.path).equals(Buffer.from("tab\tline\n.txt")))).toBe(true);

        // Ordered parents.
        expect(byOid.get(corpus.commits.merge)!.parents).toEqual([corpus.commits.left, corpus.commits.right]);
        expect(byOid.get(corpus.commits.octopus)!.parents).toEqual([corpus.commits.left, corpus.commits.right, corpus.commits.third]);

        // Merge diffs are preserved per ordered parent against the frozen oracle.
        const merge = byOid.get(corpus.commits.merge)!;
        expect(numstatBytes(diffOf(merge, 0)).toString("latin1")).toBe(recipe.oracle["merge.left"]);
        expect(numstatBytes(diffOf(merge, 1)).toString("latin1")).toBe(recipe.oracle["merge.right"]);
        const octopus = byOid.get(corpus.commits.octopus)!;
        expect(numstatBytes(diffOf(octopus, 0)).toString("latin1")).toBe(recipe.oracle["merge.left"]);
        expect(numstatBytes(diffOf(octopus, 1)).toString("latin1")).toBe(recipe.oracle["merge.right"]);
        // Secondary parents are never collapsed into the first parent.
        expect(numstatBytes(diffOf(octopus, 2)).toString("latin1"))
          .toBe(box.read(corpus.repo, ["diff-tree", "--no-ext-diff", "--no-textconv", "--no-commit-id", "-r", "-z", "--numstat", "--find-renames=100%", corpus.commits.third, corpus.commits.octopus]).toString("latin1"));
        // An unchanged tree yields an empty diff, not a fabricated one.
        expect(diffOf(byOid.get(corpus.commits.third)!, 0)).toEqual([]);
        expect(diffOf(byOid.get(corpus.commits.joinedRoots)!, 0)).toEqual([]);
        expect(diffOf(byOid.get(corpus.commits.joinedRoots)!, 1)).toHaveLength(14);

        // Tip diff vs first parent against the frozen name-status, numstat and
        // raw mode-change oracles.
        const main = byOid.get(corpus.commits.main)!;
        const mainFiles = diffOf(main, 0);
        expect(nameStatusBytes(mainFiles).toString("latin1"),
          `name-status received=${JSON.stringify(nameStatusBytes(mainFiles).toString("latin1"))} expected=${JSON.stringify(recipe.oracle.changes)}`).toBe(recipe.oracle.changes);
        expect(numstatBytes(mainFiles).toString("latin1")).toBe(recipe.oracle.numstat);
        const runSh = byPath(mainFiles, "run.sh")!;
        // The raw record carries concrete OIDs; compare through the same
        // OID symbolization the frozen oracle uses.
        expect(normalizeOracle({ modeChange: rawRecordBytes(runSh) }, corpus).modeChange).toBe(recipe.oracle.modeChange);

        // Binaries: counted as binary, never as invented text hunks.
        const binary = byPath(mainFiles, "binary.dat")!;
        expect(binary.added).toBeNull();
        expect(binary.deleted).toBeNull();
        expect(binary.oldOid).toBe(corpus.blobs.binary);
        expect(binary.newOid).toBe(corpus.blobs.binaryChanged);
        // Renames: explicit evidence with both historical paths.
        const renamed = byPath(mainFiles, "new.txt")!;
        expect(renamed.status).toBe("R100");
        expect(Buffer.from(renamed.previousPath!).toString("latin1")).toBe("old.txt");
        expect(renamed.added).toBe(0);
        expect(renamed.deleted).toBe(0);

        // Safe reads: no repository program ran, the source tree is unchanged.
        expect(existsSync(corpus.tripwireMarker)).toBe(false);
        expect(inventoryDigest(corpus)).toBe(before);
        port.assertSafeTrace();
        console.info(`L2a oracle ${format}/${refs}`, { launches: port.launches.length, counts: port.counts() });
      }
    }
  }, 120_000);

  it("backpressure bounds memory while truncated object records fail without advancing progress", async () => {
    const box = sandbox();
    const history = await buildHistory(box, { main: 1200, pr: 60 });
    const total = 1260;
    // The LIVE §13 batch floor is also the smallest accepted window (review
    // L2a-sol2, finding 3), so the multi-batch scenario uses it as is.
    const window = DEFAULT_COMMIT_BATCH;
    const port = new SandboxGitPort(box, {
      notch: { purpose: "cat-file", occurrence: 1 },
      truncate: { purpose: "cat-file", occurrence: 2, cut: 8 },
    });
    const emitted: string[] = [];
    let failure: unknown;
    const rssBefore = process.memoryUsage().rss;
    const consumption = (async () => {
      try {
        for await (const record of streamGitHistory(options(box, port, history.repo, historyRoots, { batchCommits: window }))) {
          emitted.push(record.oid);
          // Slow consumer: the pass must stay bounded even when downstream
          // work delays every record (review L2a-sol, finding 7).
          await waitForIdle(1);
        }
      } catch (error) {
        failure = error;
      }
    })();

    // Backpressure: with responses withheld, the extractor may not write
    // more object requests than the batch window. Memory is bounded by the
    // window, not by the commit count.
    let notched: LaunchRecord | undefined;
    for (let attempt = 0; attempt < 600; attempt += 1) {
      notched = port.launches.find((launch) => launch.purpose === "cat-file");
      if (notched !== undefined && notched.writes >= window) break;
      await waitForIdle();
    }
    await waitForIdle();
    expect(notched, "notched cat-file launch").toBeDefined();
    expect(notched!.writes).toBe(window);
    expect(notched!.writeBytes).toBeLessThan(window * 83);
    port.releaseNotch();
    await consumption;

    // A truncated cat-file record is a malformed stream: it fails the pass
    // instead of advancing progress past the damaged batch.
    expect(failure).toBeInstanceOf(GitStreamError);
    const error = failure as GitStreamError;
    expect(error.phase).toBe("cat-file");
    expect(error.batchIndex).toBe(1);
    expect(emitted).toHaveLength(window);
    const emittedSet = new Set(emitted);
    expect(emittedSet.size).toBe(window);

    // Resume: the acknowledged records are skipped, the rest are re-extracted,
    // and together the two passes cover the whole history exactly once.
    const resumePort = new SandboxGitPort(box);
    const resume = await drain(streamGitHistory(options(box, resumePort, history.repo, historyRoots, { batchCommits: window, knownComplete: emittedSet })));
    expect(resume.records).toHaveLength(total - window);
    expect(resume.stats.commitsSkippedComplete).toBe(window);
    const all = new Set([...emitted, ...resume.records.map((record) => record.oid)]);
    expect(all.size).toBe(total);
    for (const oid of emitted) expect(resume.records.some((record) => record.oid === oid)).toBe(false);
    port.assertSafeTrace();
    resumePort.assertSafeTrace();
    // The pass memory is asserted, not only displayed (review finding 7).
    const rssGrowth = process.memoryUsage().rss - rssBefore;
    expect(rssGrowth).toBeLessThanOrEqual(128 * 1024 * 1024);
    console.info("L2a malformed-stream resume", {
      emittedBeforeFailure: emitted.length,
      reextracted: resume.records.length,
      resumeLaunches: resumePort.launches.length,
      rssGrowth,
    });
  }, 180_000);

  it("a diff-tree response truncated at any byte fails the pass without advancing progress", async () => {
    const box = sandbox();
    // Two commits whose diff spans 12 files: the response is long enough to
    // cut at meaningful distinct positions.
    const repo = box.init(join(box.root, "truncate-repo"));
    const blob = (content: string) => box.git(repo, ["hash-object", "-w", "--no-filters", "--stdin"], content).toString().trim();
    const entriesOf = (version: number) =>
      Array.from({ length: 12 }, (_, index) => `100644 blob ${blob(`file ${index} v${version}\n`)}\tfile-${index}.txt\n`).join("");
    const rootTree = box.git(repo, ["mktree"], entriesOf(1)).toString().trim();
    const root = box.git(repo, ["commit-tree", rootTree], "root\n").toString().trim();
    const mainTree = box.git(repo, ["mktree"], entriesOf(2)).toString().trim();
    const main = box.git(repo, ["commit-tree", mainTree, "-p", root], "main\n").toString().trim();
    box.git(repo, ["update-ref", "refs/heads/main", main]);
    const roots = ["refs/heads/main"];

    // Control: the compliant port extracts both commits with all 12 files each.
    const controlPort = new SandboxGitPort(box);
    const control = await drain(streamGitHistory(options(box, controlPort, repo, roots)));
    expect(control.records.map((record) => record.oid).sort()).toEqual([main, root].sort());
    expect(diffOf(control.records.find((record) => record.oid === main)!, 0)).toHaveLength(12);
    expect(diffOf(control.records.find((record) => record.oid === root)!, -1)).toHaveLength(12);
    controlPort.assertSafeTrace();

    // Learn the byte-exact batch response once from the same argv the
    // extractor uses: truncation positions derive from real response bytes,
    // never from hardcoded offsets. The extractor's request order is
    // [main vs root, root vs empty tree]; every position below must fail.
    const responseOf = (input: string) => box.read(repo, [...diffTreeArguments()], input);
    const blockMain = responseOf(`${main} ${root}\n`);
    const blockRoot = responseOf(`${root}\n`);
    const full = Buffer.concat([blockMain, blockRoot, blockMain]);
    const echo = root.length + 1;
    const positions = [
      0,                                  // nothing at all
      echo,                               // right after the first "OID\0" (review repro)
      echo + 30,                          // inside the first raw records
      blockMain.length - 1,               // last byte of the first block cut
      blockMain.length + echo,            // right after the second "OID\0": empty second block
      blockMain.length + blockRoot.length, // both real blocks delivered, end not attested
      blockMain.length + blockRoot.length + echo, // end-of-batch marker echo only
      full.length - 1,                    // one byte missing at the very end
    ];
    expect(full.length).toBeGreaterThan(blockMain.length + blockRoot.length + echo);

    for (const keep of positions) {
      const port = new SandboxGitPort(box, { truncate: { purpose: "diff-tree", occurrence: 1, keep } });
      const emitted: string[] = [];
      let failure: unknown;
      try {
        for await (const record of streamGitHistory(options(box, port, repo, roots))) emitted.push(record.oid);
      } catch (error) {
        failure = error;
      }
      expect(failure, `truncation at byte ${keep} must fail`).toBeInstanceOf(GitStreamError);
      const error = failure as GitStreamError;
      expect(error.phase).toBe("diff-tree");
      expect(error.batchIndex).toBe(0);
      // Progress never advances past the damaged batch.
      expect(emitted).toEqual([]);
      port.assertSafeTrace();
    }
  }, 120_000);

  it("a discovery stream cut after a complete line fails the pass even with exit code 0", async () => {
    const box = sandbox();
    const history = await buildHistory(box, { main: 9, pr: 3 });

    // Cut positions derive from the real discovery output of the same argv
    // the extractor runs, never from hardcoded offsets. The truncate hook
    // delivers a shortened stdout while the child still exits 0, exactly
    // the review L2a-sol2 finding 1 repro.
    const full = box.read(history.repo, [...revListArguments(historyRoots)]);
    const firstLine = full.subarray(0, full.indexOf(10) + 1); // includes the LF
    expect(firstLine.length).toBeGreaterThan(41);

    for (const keep of [0, firstLine.length]) {
      const port = new SandboxGitPort(box, { truncate: { purpose: "rev-list", occurrence: 1, keep } });
      const emitted: string[] = [];
      let failure: unknown;
      try {
        for await (const record of streamGitHistory(options(box, port, history.repo, historyRoots))) emitted.push(record.oid);
      } catch (error) {
        failure = error;
      }
      expect(failure, `rev-list cut at byte ${keep} must fail`).toBeInstanceOf(GitStreamError);
      const error = failure as GitStreamError;
      expect(error.phase).toBe("rev-list");
      // The cut after one complete line yields that one commit first; the
      // pass must then refuse to end: no stream end is complete without
      // proof, and the expected-vs-received count is the proof.
      expect(emitted).toHaveLength(keep === 0 ? 0 : 1);
      port.assertSafeTrace();
    }
  }, 60_000);

  it("a single comparison beyond the diff byte bound is refused before publication", async () => {
    const box = sandbox();
    // One root commit whose diff carries a generated file count; every
    // response is protocol-valid, so only the retained-byte bound can
    // refuse them (review L2a-sol2, finding 2: one diff must not be able
    // to grow the heap without limit).
    const oid = "1".repeat(40);
    const commitObject = `tree ${"2".repeat(40)}\nauthor Fixture <f@example.invalid> 1700000000 +0000\ncommitter Fixture <f@example.invalid> 1700000000 +0000\n\nbig diff\n`;
    const catFile = Buffer.from(`${oid} commit ${Buffer.byteLength(commitObject)}\n${commitObject}\n`);
    const blockOf = (files: number): Buffer => {
      const parts: Buffer[] = [Buffer.from(oid), Buffer.from([0])];
      for (let index = 0; index < files; index += 1) {
        const path = `d/file-${index}.txt`;
        parts.push(Buffer.from(`:100644 100644 ${"3".repeat(40)} ${"4".repeat(40)} M\0${path}\0`));
        parts.push(Buffer.from(`1\t2\t${path}\0`));
      }
      return Buffer.concat(parts);
    };
    const scripted = (files: number): ScriptedGitPort => {
      const block = blockOf(files);
      // The batch asks for the comparison plus the sentinel repeat, so the
      // response carries two identical attested blocks.
      const response = Buffer.concat([block, block]);
      return new ScriptedGitPort((launch) => {
        if (launch.purpose === "rev-list-count") return Buffer.from("1\n");
        if (launch.purpose === "rev-list") return Buffer.from(`${oid}\n`);
        if (launch.purpose === "cat-file") return catFile;
        return response;
      });
    };
    const streamOf = (port: GitProcessPort) =>
      streamGitHistory({ port, cwd: box.root, roots: ["refs/heads/main"] });

    // Enough files that the retained raw+numstat records charge past
    // MAX_DIFF_BLOCK_BYTES: each file costs at least two structural
    // allowances on top of its path bytes.
    const over = Math.floor(MAX_DIFF_BLOCK_BYTES / (2 * DIFF_RECORD_STRUCTURAL_BYTES)) + 256;
    const port = scripted(over);
    const emitted: string[] = [];
    let failure: unknown;
    try {
      for await (const record of streamOf(port)) emitted.push(record.oid);
    } catch (error) {
      failure = error;
    }
    expect(failure, "an over-bound diff must be refused").toBeInstanceOf(GitStreamError);
    const error = failure as GitStreamError;
    expect(error.phase).toBe("diff-tree");
    expect(error.batchIndex).toBe(0);
    // Refused before publication: no commit of the batch is emitted.
    expect(emitted).toEqual([]);
    expect(port.purposes).toEqual(["rev-list-count", "rev-list", "cat-file", "diff-tree"]);

    // Control: a large but in-bound diff is still published in full — the
    // bound refuses unbounded growth, not legitimate breadth.
    const within = 2000;
    const control = scripted(within);
    const { records } = await drain(streamOf(control));
    expect(records).toHaveLength(1);
    expect(records[0]!.parentDiffs).toHaveLength(1);
    expect(records[0]!.parentDiffs[0]!.parentIndex).toBe(-1);
    expect(records[0]!.parentDiffs[0]!.files).toHaveLength(within);
  }, 60_000);

  // Review L2a-sol3, finding 1: a path field that never terminates must be
  // refused while it arrives, not at its NUL — every byte is charged on
  // arrival, so retention stays inside the bounds however long the field.
  it("diff-tree refuses an unterminated path field with bounded retention", () => {
    const parser = new DiffTreeParser();
    const oid = "1".repeat(40);
    // A well-formed echo and raw record header open exactly one path field.
    parser.push(Buffer.concat([
      Buffer.from(oid),
      Buffer.from([0]),
      Buffer.from(`:100644 100644 ${"3".repeat(40)} ${"4".repeat(40)} M`),
      Buffer.from([0]),
    ]));
    expect(parser.next()).toBeNull();
    // The review repro: 128 MiB of path pieces, small enough to defeat any
    // per-chunk guard, with the NUL never sent.
    const piece = Buffer.alloc(16 * 1024, 0x61);
    let retained = 0;
    let failure: unknown;
    for (let index = 0; index < (128 * 1024 * 1024) / piece.length; index += 1) {
      try {
        parser.push(piece);
        retained += piece.length;
      } catch (error) {
        failure = error;
        break;
      }
    }
    expect(failure, "a field past the bound must be refused").toBeInstanceOf(GitProtocolError);
    expect(retained, "refusal must come at the field bound, not after the whole stream")
      .toBeLessThanOrEqual(MAX_FIELD_BYTES);
    // Progression is not advanced: the refusal emitted no block.
    expect(parser.next()).toBeNull();
  });

  it("diff-tree refuses pending bytes past the block budget on arrival", () => {
    const parser = new DiffTreeParser();
    // Complete, in-bound fields that are never drained must still be
    // refused once the unprocessed backlog passes the block budget.
    const piece = Buffer.concat([Buffer.alloc(16 * 1024, 0x61), Buffer.from([0])]);
    let retained = 0;
    let failure: unknown;
    for (let index = 0; index < Math.ceil((MAX_DIFF_BLOCK_BYTES / piece.length) + 8); index += 1) {
      try {
        parser.push(piece);
        retained += piece.length;
      } catch (error) {
        failure = error;
        break;
      }
    }
    expect(failure, "an unprocessed backlog past the budget must be refused").toBeInstanceOf(GitProtocolError);
    expect(retained).toBeLessThanOrEqual(MAX_DIFF_BLOCK_BYTES);
  });

  it("batchCommits below the LIVE §13 batch floor is refused", async () => {
    const box = sandbox();
    const history = await buildHistory(box, { main: 9, pr: 3 });
    // A smaller window multiplies cat-file/diff-tree launches past the
    // LIVE §13 bound (review L2a-sol2, finding 3: batchCommits 64 cost 49
    // launches where 14 are allowed on a 1478-commit history); the accepted
    // configuration must respect the same contract as the default.
    const port = new SandboxGitPort(box);
    const emitted: string[] = [];
    let failure: unknown;
    try {
      for await (const record of streamGitHistory(options(box, port, history.repo, historyRoots, { batchCommits: 64 }))) {
        emitted.push(record.oid);
      }
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(GitStreamError);
    expect((failure as GitStreamError).phase).toBe("assembly");
    expect(emitted).toEqual([]);
    expect(port.launches).toEqual([]);

    // The floor itself and any larger window are accepted and stay inside
    // the process bound.
    for (const batchCommits of [DEFAULT_COMMIT_BATCH, DEFAULT_COMMIT_BATCH * 4]) {
      const accepted = new SandboxGitPort(box);
      const { records } = await drain(streamGitHistory(options(box, accepted, history.repo, historyRoots, { batchCommits })));
      expect(records).toHaveLength(12);
      expect(accepted.launches.length).toBeLessThanOrEqual(8);
      accepted.assertSafeTrace();
    }
  }, 60_000);

  it("discovery streams batch by batch instead of accumulating the whole history", async () => {
    const box = sandbox();
    const history = await buildHistory(box, { main: 1200, pr: 60 });
    const window = DEFAULT_COMMIT_BATCH;
    const total = 1260;
    // The rev-list child has written its whole output, but its end is
    // withheld: an accumulating discovery still waits for the complete
    // stream before its first batch, a streaming one has already parsed,
    // extracted and yielded whole batches.
    const port = new SandboxGitPort(box, { holdEnd: { purpose: "rev-list", occurrence: 1 } });
    const emitted: string[] = [];
    const consumption = (async () => {
      for await (const record of streamGitHistory(options(box, port, history.repo, historyRoots, { batchCommits: window }))) {
        emitted.push(record.oid);
      }
    })();
    for (let attempt = 0; attempt < 600; attempt += 1) {
      if (emitted.length >= window) break;
      await waitForIdle();
    }
    expect(emitted.length, "batches must be yielded while the rev-list end is held").toBeGreaterThanOrEqual(window);
    port.releaseNotch();
    await consumption;
    expect(emitted).toHaveLength(total);
    expect(new Set(emitted).size).toBe(total);
    port.assertSafeTrace();
  }, 180_000);

  it("UTF-8 subjects are decoded losslessly and match the Git %s oracle", async () => {
    const box = sandbox();
    const repo = box.init(join(box.root, "utf8-repo"));
    const blobOid = box.git(repo, ["hash-object", "-w", "--no-filters", "--stdin"], "contenu\n").toString().trim();
    const tree = box.git(repo, ["mktree"], `100644 blob ${blobOid}\ttexte.txt\n`).toString().trim();
    const message = "évolution: naïve café\n\nDétail du corps avec accents.\n";
    const oid = box.git(repo, ["commit-tree", tree], message).toString().trim();
    box.git(repo, ["update-ref", "refs/heads/main", oid]);
    const port = new SandboxGitPort(box);
    const { records } = await drain(streamGitHistory(options(box, port, repo, ["refs/heads/main"])));
    expect(records).toHaveLength(1);
    const record = records[0]!;
    // Original message bytes are preserved exactly.
    expect(Buffer.from(record.message).equals(Buffer.from(message))).toBe(true);
    // The subject matches the native Git %s oracle, not a mojibake decode.
    const oracle = box.read(repo, ["show", "-s", "--format=%s", oid]).toString("utf8").trimEnd();
    expect(record.subject).toBe(oracle);
    expect(record.subject).toBe("évolution: naïve café");
    port.assertSafeTrace();
  }, 60_000);

  it("octopus merges over more than eight batches stay inside the LIVE §13 process bound", async () => {
    const box = sandbox();
    // 8102 commits: side branches advance, every merge has three parents.
    const groups = 2700;
    const repo = box.init(join(box.root, `octopus-${groups}`));
    function* commands(): Generator<string> {
      yield "feature done\n";
      let mark = 0;
      const commitLine = (ref: string, parents: number[], file: string, content: string) => {
        mark += 1;
        const message = `octopus ${ref} ${mark}\n`;
        return `commit ${ref}\nmark :${mark}\ncommitter L0 Fixture <l0@example.invalid> ${1700000000 + mark} +0000\n` +
          `data ${Buffer.byteLength(message)}\n${message}` +
          (parents.length === 0 ? "" : `from :${parents[0]}\n`) +
          parents.slice(1).map((parent) => `merge :${parent}\n`).join("") +
          `M 100644 inline ${file}\ndata ${Buffer.byteLength(content)}\n${content}\n`;
      };
      yield commitLine("refs/heads/side-a", [], "a.txt", "a 0\n");
      yield commitLine("refs/heads/side-b", [], "b.txt", "b 0\n");
      let merge: number | null = null;
      for (let index = 1; index <= groups; index += 1) {
        const previousSideA = mark - (index === 1 ? 1 : 2);
        const previousSideB = mark - (index === 1 ? 0 : 1);
        yield commitLine("refs/heads/side-a", [previousSideA], "a.txt", `a ${index}\n`);
        yield commitLine("refs/heads/side-b", [previousSideB], "b.txt", `b ${index}\n`);
        yield commitLine("refs/heads/main", [merge ?? 1, mark - 1, mark], "m.txt", `m ${index}\n`);
        merge = mark;
      }
      yield "done\n";
    }
    await box.trace.stream(repo, ["fast-import", "--quiet", "--date-format=raw", "--done"], commands());
    const roots = ["refs/heads/main", "refs/heads/side-a", "refs/heads/side-b"];
    const port = new SandboxGitPort(box);
    const { records, stats } = await drain(streamGitHistory(options(box, port, repo, roots)));

    const total = 2 + 3 * groups;
    expect(records).toHaveLength(total);
    // Every merge carries three complete, non-empty per-parent diffs.
    let merges = 0;
    for (const record of records) {
      if (record.parents.length !== 3) continue;
      merges += 1;
      expect(record.parentDiffs.map((diff) => diff.parentIndex)).toEqual([0, 1, 2]);
      for (const diff of record.parentDiffs) expect(diff.files.length).toBeGreaterThan(0);
    }
    expect(merges).toBe(groups);

    const counts = port.counts();
    const launches = port.launches.length;
    // LIVE §13: <= 8 + 3 * ceil(C / 1000) = 35 for this history. A design
    // launching one diff-tree per parent index needs 37 here (review
    // finding 3): grouping every comparison of a batch into one process is
    // what keeps the bound.
    expect(launches).toBeLessThanOrEqual(8 + 3 * Math.ceil(total / 1000));
    expect(counts).toEqual({ "rev-list-count": 1, "rev-list": 1, "cat-file": 9, "diff-tree": 9 });
    expect(port.maxActive).toBeLessThanOrEqual(4);
    expect(stats.batches).toBe(9);
    port.assertSafeTrace();
    console.info("L2a octopus bound", { total, merges, launches, counts, maxActive: port.maxActive });
  }, 240_000);

  it("streaming keeps memory bounded across history sizes with a slow consumer", async () => {
    const box = sandbox();
    const sizes: { size: { main: number; pr: number } }[] = [
      { size: { main: 1200, pr: 60 } },
      { size: { main: 6000, pr: 300 } },
    ];
    const growth: number[] = [];
    for (const { size } of sizes) {
      const history = await buildHistory(box, size);
      const port = new SandboxGitPort(box);
      const rssBefore = process.memoryUsage().rss;
      let count = 0;
      for await (const record of streamGitHistory(options(box, port, history.repo, historyRoots))) {
        count += 1;
        expect(record.subject.length).toBeGreaterThan(0);
        if (count % 16 === 0) await waitForIdle(1);
      }
      const delta = process.memoryUsage().rss - rssBefore;
      growth.push(delta);
      expect(count).toBe(size.main + size.pr);
      port.assertSafeTrace();
      console.info("L2a memory pass", { size, batch: DEFAULT_COMMIT_BATCH, rssGrowth: delta });
    }
    // Bounded per pass, and — the actual accumulation probe — the larger
    // history may not grow the pass footprint beyond the documented slack of
    // the smaller one: memory is a function of the batch window, not of the
    // commit count. The rejected design measured +37.5 MB heap at 100000
    // commits (review finding 2); the deterministic red for the mechanism is
    // the held rev-list test above, this asserts the measured bound on the
    // routine corpus (the >100000-commit tier is the qualification test).
    expect(growth[0]).toBeLessThanOrEqual(128 * 1024 * 1024);
    expect(growth[1]).toBeLessThanOrEqual(128 * 1024 * 1024);
    expect(growth[1] - growth[0]).toBeLessThanOrEqual(64 * 1024 * 1024);
  }, 240_000);

  // Qualification tier, opt in: LIVE_GIT_QUALIFICATION=1 npx vitest run tests/live-git-stream.test.ts
  it.skipIf(process.env.LIVE_GIT_QUALIFICATION !== "1")("qualification tier: RSS stays bounded beyond 100000 commits", async () => {
    const box = sandbox();
    const history = await buildHistory(box, recipe.history.qualification);
    const port = new SandboxGitPort(box);
    const rssBefore = process.memoryUsage().rss;
    // Consume-and-discard: retaining records is the consumer's choice, so the
    // qualification tier discards each yielded commit to measure the stream's
    // own footprint — it must be a function of the batch window only, not of
    // the 100k+ commit count.
    const stream = streamGitHistory(options(box, port, history.repo, historyRoots));
    let count = 0;
    let stats: GitStreamStats | undefined;
    for (;;) {
      const step = await stream.next();
      if (step.done) { stats = step.value; break; }
      count += 1;
    }
    const growth = process.memoryUsage().rss - rssBefore;
    expect(count).toBe(recipe.history.qualification.main + recipe.history.qualification.pr);
    expect(stats!.batches).toBe(Math.ceil(count / 1000));
    expect(port.launches.length).toBeLessThanOrEqual(8 + 3 * Math.ceil(count / 1000));
    expect(growth).toBeLessThanOrEqual(192 * 1024 * 1024);
    port.assertSafeTrace();
    console.info("L2a QUALIFICATION rss", { commits: count, launches: port.launches.length, batches: stats!.batches, rssGrowth: growth });
  }, 600_000);
});
