/**
 * WP9 agent-stats — Phase 1 tests.
 *
 *   1. Track-WP join: a session whose Codex thread-id (session_meta.id /
 *      parent_thread_id) or h2a instance id is mandated a WP in the Track ledger
 *      is attributed to that WP.
 *   2. PR-merge attribution: a squashed merge commit on main is attributed to
 *      the session that worked the PR branch.
 *   3. `wpAgentStats` conductor view.
 *
 * Uses a committed Track ledger fixture (a thread-id mandate) and an injectable
 * `gh` runner — no live `~/.claude`, `gh`, or `git log` dependency.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { parseCodexRollout } from "../src/agent-stats/codex-rollout.js";
import { normalizeCodex } from "../src/agent-stats/normalize.js";
import { correlate, type PrMergeMeta } from "../src/agent-stats/correlate.js";
import {
  indexTrackItems,
  loadTrackItems,
  parseTrackLedger,
} from "../src/agent-stats/track-join.js";
import { getPullRequestMerge, type CommandRunner } from "../src/pr.js";
import {
  collectPrMerges,
  computeAgentStats,
  formatWpView,
  prNumberFromUrl,
  wpAgentStats,
} from "../src/agent-stats/index.js";
import type { H2aInstance } from "../src/agent-stats/registry.js";
import type { SessionFact } from "../src/agent-stats/types.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function loadFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/agent-stats/${name}`, import.meta.url), "utf-8");
}

// A Codex thread-id the fixture ledger mandates for WP9 (Nietzsche).
const WP9_THREAD_ID = "019ea9d4-c9f0-7832-9157-8e22c8e5d531";
const WP2_THREAD_ID = "019ea9d2-7979-7991-8216-1b465ec8005b";
const WP9_H2A_ID = "codex:graphify:b7615bbd3189";

describe("agent-stats Track ledger parse (WP-join source)", () => {
  it("maps WP labels to Codex thread-ids and h2a instance ids from dossiers", () => {
    const items = parseTrackLedger(loadFixture("track-ledger.jsonl"));
    const wp9 = Array.from(items.values()).find((i) => i.wp === "WP9");
    const wp2 = Array.from(items.values()).find((i) => i.wp === "WP2");
    expect(wp9).toBeDefined();
    expect(wp9!.trackItemId).toBe("01TRACKITEMWP9AGENTSTATS00");
    expect(wp9!.threadIds).toContain(WP9_THREAD_ID);
    expect(wp9!.h2aInstanceIds).toContain(WP9_H2A_ID);
    // The thread-id segmentation must not bleed WP2's id into WP9 or vice-versa.
    expect(wp9!.threadIds).not.toContain(WP2_THREAD_ID);
    expect(wp2!.threadIds).toContain(WP2_THREAD_ID);
    expect(wp2!.threadIds).not.toContain(WP9_THREAD_ID);
  });

  it("builds reverse indexes (thread-id / h2a-id → item)", () => {
    const items = parseTrackLedger(loadFixture("track-ledger.jsonl"));
    const idx = indexTrackItems(items);
    expect(idx.byThreadId.get(WP9_THREAD_ID)?.wp).toBe("WP9");
    expect(idx.byH2aId.get(WP9_H2A_ID)?.wp).toBe("WP9");
  });

  it("loadTrackItems returns an empty map when no ledger exists", () => {
    const root = mkdtempSync(join(tmpdir(), "agentstats-noledger-"));
    tempDirs.push(root);
    expect(loadTrackItems(root).size).toBe(0);
  });
});

describe("agent-stats Track-WP correlation join", () => {
  /** Build a Codex SessionFact whose session_meta.id is the mandated thread-id. */
  function codexFact(threadId: string, branch = "feat/wp9"): SessionFact {
    const lines = [
      JSON.stringify({
        type: "session_meta",
        timestamp: "2026-06-09T01:00:00.000Z",
        payload: { id: threadId, cwd: "/tmp/repo", cli_version: "0.1", git: { branch } },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-06-09T01:01:00.000Z",
        payload: { type: "function_call", name: "exec_command", call_id: "c1", arguments: JSON.stringify({ cmd: `git checkout -b ${branch}`, workdir: "/tmp/repo" }) },
      }),
    ].join("\n");
    return normalizeCodex(parseCodexRollout(lines, threadId));
  }

  it("attributes a session to a WP via its Codex thread-id (session_meta.id)", () => {
    const items = parseTrackLedger(loadFixture("track-ledger.jsonl"));
    const fact = codexFact(WP9_THREAD_ID);
    const links = correlate({
      facts: [fact],
      instances: [],
      commits: [],
      trackIndex: indexTrackItems(items),
    });
    const wpLink = links.find((l) => l.rule === "track-wp-thread-id");
    expect(wpLink).toBeDefined();
    expect(wpLink!.target).toMatchObject({ kind: "wp", wp: "WP9", trackItemId: "01TRACKITEMWP9AGENTSTATS00" });
    expect(wpLink!.confidence).toBe("medium");
    // Never derives identity from a git author.
    expect(wpLink!.agentId).not.toBe("antoinefa");
  });

  it("attributes a session to a WP via its parent_thread_id", () => {
    const lines = [
      JSON.stringify({
        type: "session_meta",
        timestamp: "2026-06-09T01:00:00.000Z",
        payload: {
          id: "child-sess-xyz",
          cwd: "/tmp/repo",
          source: { subagent: { thread_spawn: { parent_thread_id: WP9_THREAD_ID, agent_nickname: "Nietzsche" } } },
        },
      }),
    ].join("\n");
    const fact = normalizeCodex(parseCodexRollout(lines, "child-sess-xyz"));
    const links = correlate({ facts: [fact], instances: [], commits: [], trackIndex: indexTrackItems(parseTrackLedger(loadFixture("track-ledger.jsonl"))) });
    expect(links.some((l) => l.rule === "track-wp-thread-id" && l.target.kind === "wp" && l.target.wp === "WP9")).toBe(true);
  });

  it("attributes a session to a WP via its matched h2a instance id", () => {
    const items = parseTrackLedger(loadFixture("track-ledger.jsonl"));
    // A session whose cwd is under the registered codex:graphify workspace.
    const instances: H2aInstance[] = [
      { id: WP9_H2A_ID, host: "codex", name: "graphify", workspacePath: "/tmp/repo", label: "graphify" },
    ];
    const fact = codexFact("some-unmandated-thread");
    const links = correlate({ facts: [fact], instances, commits: [], trackIndex: indexTrackItems(items) });
    const wpLink = links.find((l) => l.rule === "track-wp-h2a-id");
    expect(wpLink).toBeDefined();
    expect(wpLink!.target).toMatchObject({ kind: "wp", wp: "WP9" });
    expect(wpLink!.agentId).toBe(WP9_H2A_ID);
  });

  it("emits no WP link when no thread-id / h2a-id matches", () => {
    const items = parseTrackLedger(loadFixture("track-ledger.jsonl"));
    const fact = codexFact("totally-unknown-thread");
    const links = correlate({ facts: [fact], instances: [], commits: [], trackIndex: indexTrackItems(items) });
    expect(links.some((l) => l.target.kind === "wp")).toBe(false);
  });
});

describe("agent-stats PR-merge attribution", () => {
  function branchFact(branch: string): SessionFact {
    const lines = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-06-09T01:00:00.000Z", payload: { id: "sess-pr", cwd: "/tmp/repo", git: { branch } } }),
      JSON.stringify({ type: "response_item", timestamp: "2026-06-09T01:01:00.000Z", payload: { type: "function_call", name: "exec_command", call_id: "c1", arguments: JSON.stringify({ cmd: `git checkout -b ${branch}`, workdir: "/tmp/repo" }) } }),
      JSON.stringify({ type: "response_item", timestamp: "2026-06-09T01:02:00.000Z", payload: { type: "function_call", name: "exec_command", call_id: "c2", arguments: JSON.stringify({ cmd: "git commit -m wip", workdir: "/tmp/repo" }) } }),
    ].join("\n");
    return normalizeCodex(parseCodexRollout(lines, "sess-pr"));
  }

  it("attributes the squashed merge commit on main to the branch session", () => {
    const fact = branchFact("feat/wp9");
    const mergeSha = "abcdef1234567890abcdef1234567890abcdef12";
    const prMerges: PrMergeMeta[] = [{ number: 99, branch: "feat/wp9", mergeCommit: mergeSha }];
    const links = correlate({ facts: [fact], instances: [], commits: [], prMerges });
    const prLink = links.find((l) => l.rule === "pr-merge");
    expect(prLink).toBeDefined();
    expect(prLink!.rank).toBe(2);
    expect(prLink!.confidence).toBe("high");
    expect(prLink!.target).toMatchObject({ kind: "commit", sha: mergeSha, branch: "feat/wp9" });
    // A pr-merge commit suppresses the weak worktree-branch-window link for it.
    expect(links.some((l) => l.rule === "worktree-branch-window" && l.target.kind === "branch" && l.target.branch === "feat/wp9")).toBe(false);
  });

  it("does not invent a pr-merge link when the branch has no merge entry", () => {
    const fact = branchFact("feat/wp9");
    const links = correlate({ facts: [fact], instances: [], commits: [], prMerges: [{ number: 1, branch: "other", mergeCommit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }] });
    expect(links.some((l) => l.rule === "pr-merge")).toBe(false);
  });
});

describe("pr.getPullRequestMerge (gh runner mock)", () => {
  it("parses number, mergeCommit oid, commit oids, and headRefName", () => {
    const runner: CommandRunner = {
      run(command, args) {
        if (command === "git") return "https://github.com/rhanka/graphify/x.git";
        // gh pr view <n> --json number,mergeCommit,commits,headRefName
        expect(args[0]).toBe("pr");
        expect(args).toContain("number,mergeCommit,commits,headRefName");
        return JSON.stringify({
          number: 130,
          headRefName: "feat/agent-stats-mvp",
          mergeCommit: { oid: "613bf6100000000000000000000000000000abcd" },
          commits: [{ oid: "8f2fbf400000000000000000000000000000abcd" }, { oid: "aaaaaaa00000000000000000000000000000abcd" }],
        });
      },
    };
    const info = getPullRequestMerge(130, { cwd: "/tmp/repo", runner });
    expect(info.number).toBe(130);
    expect(info.headRefName).toBe("feat/agent-stats-mvp");
    expect(info.mergeCommit).toBe("613bf6100000000000000000000000000000abcd");
    expect(info.commits).toEqual(["8f2fbf400000", "aaaaaaa00000"]);
  });

  it("returns undefined mergeCommit for an unmerged PR", () => {
    const runner: CommandRunner = {
      run(command) {
        if (command === "git") return "git@github.com:rhanka/graphify.git";
        return JSON.stringify({ number: 200, headRefName: "feat/x", commits: [], mergeCommit: null });
      },
    };
    expect(getPullRequestMerge(200, { cwd: "/tmp/repo", runner }).mergeCommit).toBeUndefined();
  });
});

describe("agent-stats collectPrMerges (gh runner mock, no live gh)", () => {
  it("resolves a branch → merged PR → merge commit via gh", () => {
    const fact = {
      factId: "codex:s1",
      host: "codex",
      sessionId: "s1",
      cwds: ["/tmp/repo"],
      models: [],
      tokens: { input: 0, output: 0, cached: 0, total: 0 },
      gitActions: [{ verb: "commit", command: "git commit" }],
      groundTruth: { commitShas: [], branches: [], shaBranch: {}, prUrls: [] },
      branchesObserved: ["feat/wp9"],
      filesTouched: [],
      evidence: [],
    } as SessionFact;
    const runner: CommandRunner = {
      run(command, args) {
        if (command === "git") return "https://github.com/rhanka/graphify.git";
        if (args[1] === "list") {
          return JSON.stringify([{ number: 130, title: "wp9", state: "MERGED", isDraft: false, headRefName: "feat/wp9", baseRefName: "main" }]);
        }
        // pr view
        return JSON.stringify({ number: 130, headRefName: "feat/wp9", mergeCommit: { oid: "1111111000000000000000000000000000000abc" }, commits: [] });
      },
    };
    const merges = collectPrMerges("/tmp/repo", [fact], runner);
    expect(merges).toHaveLength(1);
    expect(merges[0]).toMatchObject({ number: 130, branch: "feat/wp9", mergeCommit: "1111111000000000000000000000000000000abc" });
  });

  it("prNumberFromUrl extracts the PR number", () => {
    expect(prNumberFromUrl("https://github.com/rhanka/graphify/pull/119")).toBe(119);
    expect(prNumberFromUrl("not a url")).toBeUndefined();
  });
});

describe("agent-stats wp <trackItemId> conductor view", () => {
  /** A repo with the fixture ledger + a persisted Codex fact mandated WP9. */
  function setupRepoWithWp9Session(): { repoRoot: string } {
    const root = mkdtempSync(join(tmpdir(), "agentstats-wp-"));
    tempDirs.push(root);
    // Track ledger fixture at .track/events.jsonl
    mkdirSync(join(root, ".track"), { recursive: true });
    writeFileSync(join(root, ".track", "events.jsonl"), loadFixture("track-ledger.jsonl"));
    // Persist a Codex fact whose session_meta.id is the WP9-mandated thread-id.
    mkdirSync(join(root, ".graphify", "agents"), { recursive: true });
    const lines = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-06-09T01:00:00.000Z", payload: { id: WP9_THREAD_ID, cwd: "/tmp/repo", git: { branch: "feat/wp9" } } }),
      JSON.stringify({ type: "response_item", timestamp: "2026-06-09T01:01:00.000Z", payload: { type: "function_call", name: "exec_command", call_id: "c1", arguments: JSON.stringify({ cmd: "git checkout -b feat/wp9", workdir: "/tmp/repo" }) } }),
    ].join("\n");
    const fact = normalizeCodex(parseCodexRollout(lines, WP9_THREAD_ID));
    writeFileSync(join(root, ".graphify", "agents", "facts.jsonl"), JSON.stringify(fact) + "\n");
    return { repoRoot: root };
  }

  it("resolves by track item id and lists the joined agent/session", () => {
    const { repoRoot } = setupRepoWithWp9Session();
    const result = wpAgentStats(repoRoot, "01TRACKITEMWP9AGENTSTATS00", { injectedCommits: [], skipPrMerges: true });
    expect(result.item?.wp).toBe("WP9");
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]!.rule).toBe("track-wp-thread-id");
    const view = formatWpView(result, "01TRACKITEMWP9AGENTSTATS00");
    expect(view).toContain("Work-package: WP9");
    expect(view).toContain(result.sessions[0]!.agentId);
    expect(view).not.toContain("antoinefa");
  });

  it("resolves by WP label (convenience) and reports the WPS via computeAgentStats", () => {
    const { repoRoot } = setupRepoWithWp9Session();
    const result = wpAgentStats(repoRoot, "WP9", { injectedCommits: [], skipPrMerges: true });
    expect(result.item?.trackItemId).toBe("01TRACKITEMWP9AGENTSTATS00");
    // The stats table picks up WP9 from the Track-WP join (no branch carried it).
    const { rows } = computeAgentStats(repoRoot, { injectedCommits: [], skipPrMerges: true });
    const agentRow = rows.find((r) => r.wpsTouched.includes("WP9"));
    expect(agentRow).toBeDefined();
  });

  it("reports an unknown-id message listing known WP items", () => {
    const { repoRoot } = setupRepoWithWp9Session();
    const result = wpAgentStats(repoRoot, "01DOESNOTEXIST0000000000000", { injectedCommits: [], skipPrMerges: true });
    expect(result.item).toBeUndefined();
    const view = formatWpView(result, "01DOESNOTEXIST0000000000000");
    expect(view).toContain("No Track work-package matches");
    expect(view).toContain("WP9");
  });
});
