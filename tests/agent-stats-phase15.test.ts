/**
 * WP9 agent-stats — Phase 1.5 hardening tests (adversarial-review fixes).
 *
 *   P0-1 Ground truth is gated on git verbs: a session that merely cat/greps a
 *        foreign transcript or CI log must NOT acquire its shas / PR urls.
 *   P0-2 Multi-WP join: an id mandated to several WPs joins to ALL of them, and
 *        decision.targets ULIDs (structured) are preferred over regex-over-prose.
 *   P0-3 rank-4 (h2a-registry) is identity ONLY — no branch credit without a
 *        commit/checkout-b on that exact branch.
 *   P0-4 rank-2 (pr-merge) is branch-scoped, squash commits dedupe against the
 *        session's own branch commits, PR urls are scoped to the origin repo.
 *   P0-5 discover scans worktree slug dirs (`.` → `-`).
 *   P0-6 cross-repo sessions only credit in-repo work.
 *   P1   redaction (dash-slug, new token shapes, cursors.json), residual row,
 *        cost-weighted tokens + confidence, persisted links, wp view both-sides.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { parseClaudeTranscript } from "../src/agent-stats/claude-transcript.js";
import { parseCodexRollout } from "../src/agent-stats/codex-rollout.js";
import { normalizeClaude, normalizeCodex } from "../src/agent-stats/normalize.js";
import { correlate, type PrMergeMeta } from "../src/agent-stats/correlate.js";
import { aggregate } from "../src/agent-stats/stats.js";
import { indexTrackItems, parseTrackLedger } from "../src/agent-stats/track-join.js";
import { redact } from "../src/agent-stats/redact.js";
import { discoverClaude, repoSlug } from "../src/agent-stats/discover.js";
import { loadCursors, resolveStore, saveCursors } from "../src/agent-stats/store.js";
import type { CommandRunner } from "../src/pr.js";
import {
  collectPrMerges,
  computeAgentStats,
  formatStatsTable,
  formatWpView,
  syncAgentStats,
  wpAgentStats,
} from "../src/agent-stats/index.js";
import type { H2aInstance } from "../src/agent-stats/registry.js";
import type { FileCursor, SessionFact } from "../src/agent-stats/types.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(d);
  return d;
}

// ---------------------------------------------------------------------------
// P0-1: ground truth gated on git verbs (spoof resistance)
// ---------------------------------------------------------------------------

describe("ground truth is gated on git-verb inputs (spoof resistance)", () => {
  function claudeLines(command: string, output: string): string {
    return [
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-06-10T10:00:00.000Z",
        cwd: "/tmp/repo",
        sessionId: "s-spoof",
        message: { model: "m", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command } }] },
      }),
      JSON.stringify({
        type: "user",
        timestamp: "2026-06-10T10:00:01.000Z",
        cwd: "/tmp/repo",
        sessionId: "s-spoof",
        message: { content: [{ type: "tool_result", tool_use_id: "t1", content: output }] },
      }),
    ].join("\n");
  }

  const FOREIGN = "[feat/foreign 1234567] stolen subject\nhttps://github.com/rhanka/graphify/pull/777";

  it("claude: cat/grep of a foreign transcript does NOT acquire shas or PR urls", () => {
    for (const cmd of ["cat ~/.claude/projects/other/x.jsonl", "grep -r commit ci.log", "tail -n 50 build.log"]) {
      const s = parseClaudeTranscript(claudeLines(cmd, FOREIGN), "s-spoof");
      expect(s.groundTruth.commitShas).toEqual([]);
      expect(s.groundTruth.prUrls).toEqual([]);
    }
  });

  it("claude: a read-only git command (git log/show) does not acquire shas", () => {
    const s = parseClaudeTranscript(claudeLines("git log --oneline -5", FOREIGN), "s-spoof");
    expect(s.groundTruth.commitShas).toEqual([]);
  });

  it("claude: a real `git commit` output still IS scraped", () => {
    const s = parseClaudeTranscript(claudeLines("git add -A && git commit -m 'x'", "[feat/mine abcdef1] x"), "s-spoof");
    expect(s.groundTruth.commitShas).toContain("abcdef1");
    expect(s.groundTruth.shaBranch["abcdef1"]).toBe("feat/mine");
  });

  it("codex: non-git outputs are not scraped; outputs pair by call_id", () => {
    const lines = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-06-10T10:00:00.000Z", payload: { id: "cx-1", cwd: "/tmp/repo" } }),
      // read-only command whose output embeds a foreign sha
      JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "a", arguments: JSON.stringify({ cmd: "grep -r sha /tmp/logs", workdir: "/tmp/repo" }) } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call_output", call_id: "a", output: FOREIGN } }),
      // an output with an unknown call_id must not be scraped either
      JSON.stringify({ type: "response_item", payload: { type: "function_call_output", call_id: "zz", output: "[main 9999999] ghost" } }),
      // real commit is scraped
      JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "b", arguments: JSON.stringify({ cmd: "git commit -m ok", workdir: "/tmp/repo" }) } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call_output", call_id: "b", output: "[feat/mine 7654321] ok" } }),
    ].join("\n");
    const s = parseCodexRollout(lines, "cx-1");
    expect(s.groundTruth.commitShas).toEqual(["7654321"]);
    expect(s.groundTruth.prUrls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// P0-2: multi-WP join + decision.targets ULID join
// ---------------------------------------------------------------------------

describe("track-join: multi-WP ids and decision.targets ULIDs", () => {
  const H2A = "claude:graphify:17bddf135979";

  it("an id mandated to several WPs joins to ALL of them", () => {
    const ledger = [
      JSON.stringify({ type: "item.created", aggregateId: "01ITEMWP3AAAAAAAAAAAAAAAAA", payload: { title: "WP3 Graph storage backends" } }),
      JSON.stringify({ type: "item.created", aggregateId: "01ITEMWP5AAAAAAAAAAAAAAAAA", payload: { title: "WP5 Track F upstream parity residuals" } }),
      JSON.stringify({
        type: "dossier.revised",
        aggregateId: "01DOSSIERAAAAAAAAAAAAAAAAA",
        payload: { dossier: { context: `Delegation envelopes deposited: WP3/WP5 to ${H2A} (env:wp3-wp5, recipientLive=false).` } },
      }),
    ].join("\n");
    const items = parseTrackLedger(ledger);
    const wp3 = Array.from(items.values()).find((i) => i.wp === "WP3")!;
    const wp5 = Array.from(items.values()).find((i) => i.wp === "WP5")!;
    expect(wp3.h2aInstanceIds).toContain(H2A);
    expect(wp5.h2aInstanceIds).toContain(H2A);
    // The reverse index maps the id to BOTH items.
    const idx = indexTrackItems(items);
    expect((idx.byH2aId.get(H2A) ?? []).map((i) => i.wp).sort()).toEqual(["WP3", "WP5"]);
  });

  it("correlate emits one WP link per mandated item for a multi-WP id", () => {
    const ledger = [
      JSON.stringify({ type: "item.created", aggregateId: "01ITEMWP3AAAAAAAAAAAAAAAAA", payload: { title: "WP3 Graph storage backends" } }),
      JSON.stringify({ type: "item.created", aggregateId: "01ITEMWP5AAAAAAAAAAAAAAAAA", payload: { title: "WP5 Track F parity" } }),
      JSON.stringify({
        type: "dossier.revised",
        aggregateId: "01DOSSIERAAAAAAAAAAAAAAAAA",
        payload: { dossier: { context: "WP3/WP5 -> 019ea9d2-7979-7991-8216-1b465ec8005b (Ohm)" } },
      }),
    ].join("\n");
    const lines = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-06-09T01:00:00.000Z", payload: { id: "019ea9d2-7979-7991-8216-1b465ec8005b", cwd: "/tmp/repo" } }),
    ].join("\n");
    const fact = normalizeCodex(parseCodexRollout(lines, "019ea9d2-7979-7991-8216-1b465ec8005b"));
    const links = correlate({ facts: [fact], instances: [], commits: [], trackIndex: indexTrackItems(parseTrackLedger(ledger)) });
    const wpLinks = links.filter((l) => l.target.kind === "wp");
    expect(wpLinks.map((l) => (l.target.kind === "wp" ? l.target.wp : "")).sort()).toEqual(["WP3", "WP5"]);
  });

  it("prefers decision.targets ULIDs: ids attach to the targeted item, not prose WP labels", () => {
    const ledger = [
      // The real WP9 item: title carries NO "WP9" token.
      JSON.stringify({
        type: "item.created",
        aggregateId: "01KTSBMC1HJ1N8XMQYK17CGDAP",
        payload: { title: "Agent-stats support layer: parse agentic conversations + track agents", body: "MAJOR backlog feature. Not started." },
      }),
      JSON.stringify({ type: "item.created", aggregateId: "01ITEMWP6AAAAAAAAAAAAAAAAA", payload: { title: "WP6 Public UAT and mysterypack publication" } }),
      JSON.stringify({
        type: "decision.created",
        aggregateId: "01DECISIONWP9AAAAAAAAAAAAA",
        payload: {
          decisionKind: "delegation",
          title: "WP9 agent-stats design (consensus)",
          targets: ["01KTSBMC1HJ1N8XMQYK17CGDAP"],
          dossier: { context: "WP9 agent-stats delegated to codex:graphify:b7615bbd3189. Conductor remains owner of WP6 publication." },
        },
      }),
    ].join("\n");
    const items = parseTrackLedger(ledger);
    const wp9 = items.get("01KTSBMC1HJ1N8XMQYK17CGDAP")!;
    const wp6 = items.get("01ITEMWP6AAAAAAAAAAAAAAAAA")!;
    // The targeted item gets the id even though its title has no WP token...
    expect(wp9.h2aInstanceIds).toContain("codex:graphify:b7615bbd3189");
    // ...and inherits the WP label from the single-target decision title.
    expect(wp9.wp).toBe("WP9");
    // The prose mention of "WP6" must NOT leak the id into the WP6 item.
    expect(wp6.h2aInstanceIds).toEqual([]);
  });

  it("parses the WP label from the item body when the title lacks it", () => {
    const ledger = [
      JSON.stringify({
        type: "item.created",
        aggregateId: "01ITEMBODYAAAAAAAAAAAAAAAA",
        payload: { title: "Agent-stats support layer", body: "This is the WP9 workpackage for agent stats." },
      }),
    ].join("\n");
    const item = parseTrackLedger(ledger).get("01ITEMBODYAAAAAAAAAAAAAAAA")!;
    expect(item.wp).toBe("WP9");
  });
});

// ---------------------------------------------------------------------------
// P0-3: rank-4 h2a-registry is identity-only
// ---------------------------------------------------------------------------

describe("rank-4 h2a-registry link is identity only", () => {
  it("a read-only session gets NO branch credit from its registry match", () => {
    const lines = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-06-09T01:00:00.000Z", payload: { id: "ro-1", cwd: "/tmp/repo", git: { branch: "feat/observed-only" } } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "c1", arguments: JSON.stringify({ cmd: "git log --oneline", workdir: "/tmp/repo" }) } }),
    ].join("\n");
    const fact = normalizeCodex(parseCodexRollout(lines, "ro-1"));
    const instances: H2aInstance[] = [
      { id: "codex:graphify:b7615bbd3189", host: "codex", name: "graphify", workspacePath: "/tmp/repo", label: "graphify" },
    ];
    const links = correlate({ facts: [fact], instances, commits: [] });
    const rank4 = links.find((l) => l.rule === "h2a-registry");
    expect(rank4).toBeDefined();
    // Identity only: never a real branch without commit/checkout-b evidence.
    expect(rank4!.target).toMatchObject({ kind: "branch", branch: "(workspace)" });
    // And no other link credits the merely-observed branch.
    expect(links.some((l) => l.target.kind === "branch" && l.target.branch === "feat/observed-only")).toBe(false);
    const rows = aggregate({ facts: [fact], links, instances });
    expect(rows[0]!.branches).toBe(0);
  });

  it("excludes main from rank-4 branch labels even when worked", () => {
    const lines = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-06-09T01:00:00.000Z", payload: { id: "m-1", cwd: "/tmp/repo", git: { branch: "main" } } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "c1", arguments: JSON.stringify({ cmd: "git commit -m x", workdir: "/tmp/repo" }) } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call_output", call_id: "c1", output: "[main 1111111] x" } }),
    ].join("\n");
    const fact = normalizeCodex(parseCodexRollout(lines, "m-1"));
    const instances: H2aInstance[] = [
      { id: "codex:graphify:b7615bbd3189", host: "codex", name: "graphify", workspacePath: "/tmp/repo", label: "graphify" },
    ];
    const links = correlate({ facts: [fact], instances, commits: [] });
    const rank4 = links.find((l) => l.rule === "h2a-registry");
    expect(rank4!.target).toMatchObject({ kind: "branch", branch: "(workspace)" });
  });
});

// ---------------------------------------------------------------------------
// P0-4: rank-2 branch-scoped, squash dedupe, origin-scoped PR urls
// ---------------------------------------------------------------------------

describe("rank-2 pr-merge hardening", () => {
  function commitFact(workBranch: string, observedBranch = workBranch): SessionFact {
    const lines = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-06-09T01:00:00.000Z", payload: { id: "sq-1", cwd: "/tmp/repo", git: { branch: observedBranch } } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "c1", arguments: JSON.stringify({ cmd: "git commit -m wip", workdir: "/tmp/repo" }) } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call_output", call_id: "c1", output: `[${workBranch} abc1234] wip` } }),
    ].join("\n");
    return normalizeCodex(parseCodexRollout(lines, "sq-1"));
  }

  it("requires commit/checkout-b evidence on THAT branch (not any branch)", () => {
    // Session observed feat/y but only ever committed on feat/x.
    const fact = commitFact("feat/x", "feat/y");
    const prMerges: PrMergeMeta[] = [{ number: 7, branch: "feat/y", mergeCommit: "f".repeat(40) }];
    const links = correlate({ facts: [fact], instances: [], commits: [], prMerges });
    expect(links.some((l) => l.rule === "pr-merge")).toBe(false);
  });

  it("dedupes the squash commit against the session's own branch commits (no N+1)", () => {
    const fact = commitFact("feat/x");
    const mergeSha = "f".repeat(40);
    const links = correlate({
      facts: [fact],
      instances: [],
      commits: [{ sha: "abc1234" + "0".repeat(33), subject: "wip" }],
      prMerges: [{ number: 7, branch: "feat/x", mergeCommit: mergeSha }],
    });
    expect(links.some((l) => l.rule === "commit-sha-output")).toBe(true);
    expect(links.some((l) => l.rule === "pr-merge")).toBe(true);
    const rows = aggregate({ facts: [fact], links, instances: [] });
    // 1 branch commit + its squash = ONE unit of work, not two.
    expect(rows[0]!.commits).toBe(1);
  });

  it("collectPrMerges ignores PR urls from foreign repos (origin-scoped)", () => {
    const fact: SessionFact = {
      factId: "codex:s1",
      host: "codex",
      sessionId: "s1",
      cwds: ["/tmp/repo"],
      models: [],
      tokens: { input: 0, output: 0, cached: 0, total: 0 },
      gitActions: [{ verb: "commit", command: "git commit" }],
      groundTruth: { commitShas: [], branches: [], shaBranch: {}, prUrls: ["https://github.com/evil/elsewhere/pull/99"] },
      branchesObserved: ["feat/wp9"],
      filesTouched: [],
      evidence: [],
    };
    const calls: string[] = [];
    const runner: CommandRunner = {
      run(command, args) {
        calls.push(`${command} ${args.join(" ")}`);
        if (command === "git") return "https://github.com/rhanka/graphify.git";
        if (args[1] === "list") return JSON.stringify([]);
        return JSON.stringify({ number: 99, headRefName: "feat/wp9", mergeCommit: { oid: "9".repeat(40) }, commits: [] });
      },
    };
    const merges = collectPrMerges("/tmp/repo", [fact], runner);
    expect(merges).toEqual([]);
    // It must never have fetched PR #99 from the foreign url.
    expect(calls.some((c) => c.includes("view 99"))).toBe(false);
  });

  it("collectPrMerges still accepts origin-repo PR urls", () => {
    const fact: SessionFact = {
      factId: "codex:s1",
      host: "codex",
      sessionId: "s1",
      cwds: ["/tmp/repo"],
      models: [],
      tokens: { input: 0, output: 0, cached: 0, total: 0 },
      gitActions: [{ verb: "commit", command: "git commit" }],
      groundTruth: { commitShas: [], branches: [], shaBranch: {}, prUrls: ["https://github.com/rhanka/graphify/pull/130"] },
      branchesObserved: ["feat/wp9"],
      filesTouched: [],
      evidence: [],
    };
    const runner: CommandRunner = {
      run(command, args) {
        if (command === "git") return "git@github.com:rhanka/graphify.git";
        if (args[1] === "list") return JSON.stringify([]);
        return JSON.stringify({ number: 130, headRefName: "feat/wp9", mergeCommit: { oid: "1".repeat(40) }, commits: [] });
      },
    };
    const merges = collectPrMerges("/tmp/repo", [fact], runner);
    expect(merges).toHaveLength(1);
    expect(merges[0]).toMatchObject({ number: 130, branch: "feat/wp9" });
  });
});

// ---------------------------------------------------------------------------
// P0-5: discover scans worktree slug dirs (. → -)
// ---------------------------------------------------------------------------

describe("discover: worktree slug dirs", () => {
  it("repoSlug maps every non-alphanumeric character to '-' like the Claude host", () => {
    expect(repoSlug("/home/u/src/graphify")).toBe("-home-u-src-graphify");
    expect(repoSlug("/home/u/src/repo.js")).toBe("-home-u-src-repo-js");
    expect(repoSlug("/home/u/src/graphify/.claude/worktrees/agent-x")).toBe(
      "-home-u-src-graphify--claude-worktrees-agent-x",
    );
  });

  it("discoverClaude scans the repo dir AND its worktree slug dirs", () => {
    const home = tmp("agentstats-home-");
    const repoRoot = "/home/u/src/graphify";
    const slug = repoSlug(repoRoot);
    const mainDir = join(home, ".claude", "projects", slug);
    const wtDir = join(home, ".claude", "projects", `${slug}--claude-worktrees-agent-1`);
    const otherDir = join(home, ".claude", "projects", "-home-u-src-other");
    for (const d of [mainDir, wtDir, otherDir]) mkdirSync(d, { recursive: true });
    writeFileSync(join(mainDir, "aaa.jsonl"), "{}\n");
    writeFileSync(join(wtDir, "bbb.jsonl"), "{}\n");
    writeFileSync(join(otherDir, "ccc.jsonl"), "{}\n");
    const found = discoverClaude(home, slug).map((f) => f.sessionId).sort();
    expect(found).toContain("aaa");
    expect(found).toContain("bbb"); // worktree transcripts are now scanned
    expect(found).not.toContain("ccc"); // unrelated repo stays out
  });

  it("syncAgentStats picks up a worktree-dir transcript end-to-end", () => {
    const repoRoot = tmp("agentstats-repo-");
    const home = tmp("agentstats-home-");
    const fixture = readFileSync(new URL("./fixtures/agent-stats/claude-wp1-repo-keys.jsonl", import.meta.url), "utf-8")
      .split("__REPO__")
      .join(repoRoot);
    const wtSlugDir = join(home, ".claude", "projects", `${repoSlug(repoRoot)}--claude-worktrees-agent-wp1abc`);
    mkdirSync(wtSlugDir, { recursive: true });
    writeFileSync(join(wtSlugDir, "fixture-wp1-0001.jsonl"), fixture);
    const result = syncAgentStats({ repoRoot, home });
    expect(result.inRepo).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// P0-6: cross-repo sessions only credit in-repo work
// ---------------------------------------------------------------------------

describe("cross-repo segmentation", () => {
  it("claude: tokens/branches/commits from a foreign-repo cwd are not counted", () => {
    const repo = "/tmp/repo";
    const lines = [
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-06-10T10:00:00.000Z",
        cwd: repo,
        gitBranch: "feat/in-repo",
        message: {
          model: "m",
          usage: { input_tokens: 100, output_tokens: 10 },
          content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "git commit -m in" } }],
        },
      }),
      JSON.stringify({ type: "user", timestamp: "2026-06-10T10:00:01.000Z", cwd: repo, message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "[feat/in-repo 1111111] in" }] } }),
      // Foreign-repo segment of the same session:
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-06-10T10:05:00.000Z",
        cwd: "/tmp/other-project",
        gitBranch: "feat/foreign",
        message: {
          model: "m",
          usage: { input_tokens: 5000, output_tokens: 500 },
          content: [{ type: "tool_use", id: "t2", name: "Bash", input: { command: "git commit -m out" } }],
        },
      }),
      JSON.stringify({ type: "user", timestamp: "2026-06-10T10:05:01.000Z", cwd: "/tmp/other-project", message: { content: [{ type: "tool_result", tool_use_id: "t2", content: "[feat/foreign 2222222] out" }] } }),
    ].join("\n");
    const s = parseClaudeTranscript(lines, "x-repo", "", { scopeRoot: repo });
    expect(s.groundTruth.commitShas).toEqual(["1111111"]);
    expect(s.branches).toContain("feat/in-repo");
    expect(s.branches).not.toContain("feat/foreign");
    expect(s.tokens.input).toBe(100);
    expect(s.tokens.output).toBe(10);
    // The foreign cwd is still recorded (identity/debug) but contributes no work.
    expect(s.gitActions.filter((a) => a.verb === "commit")).toHaveLength(1);
  });

  it("codex: a git commit run with a foreign workdir is not credited", () => {
    const lines = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-06-10T10:00:00.000Z", payload: { id: "cx-seg", cwd: "/tmp/repo" } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "a", arguments: JSON.stringify({ cmd: "git commit -m out", workdir: "/tmp/other" }) } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call_output", call_id: "a", output: "[feat/foreign 2222222] out" } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "b", arguments: JSON.stringify({ cmd: "git commit -m in", workdir: "/tmp/repo" }) } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call_output", call_id: "b", output: "[feat/in 3333333] in" } }),
    ].join("\n");
    const s = parseCodexRollout(lines, "cx-seg", "", { scopeRoot: "/tmp/repo" });
    expect(s.groundTruth.commitShas).toEqual(["3333333"]);
    expect(s.gitActions.filter((a) => a.verb === "commit")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Privacy: redaction hardening + cursors.json
// ---------------------------------------------------------------------------

describe("redaction hardening", () => {
  it("redacts the dash-slug home form", () => {
    const out = redact("ls ~/.claude/projects/-home-antoinefa-src-graphify--claude-worktrees-x/", "/home/antoinefa");
    expect(out).not.toContain("antoinefa");
  });

  it("redacts a dash-slug inside a /tmp path", () => {
    const out = redact("cp /tmp/seed/-home-antoinefa-src-graphify/file .", "/home/antoinefa");
    expect(out).not.toContain("antoinefa");
  });

  it("redacts AWS, GitLab, Slack, npm tokens and user:token@host urls", () => {
    const samples: [string, string][] = [
      ["aws AKIAIOSFODNN7EXAMPLE key", "AKIAIOSFODNN7EXAMPLE"],
      ["gitlab glpat-AbCdEfGhIjKlMnOpQrSt token", "glpat-AbCdEfGhIjKlMnOpQrSt"],
      ["slack xoxb-123456789012-AbCdEfGhIjKl hook", "xoxb-123456789012-AbCdEfGhIjKl"],
      ["npm npm_AbCdEfGhIjKlMnOpQrStUvWxYz012345 publish", "npm_AbCdEfGhIjKlMnOpQrStUvWxYz012345"],
      ["git clone https://bob:s3cr3tpass@github.com/x/y.git", "s3cr3tpass"],
    ];
    for (const [raw, secret] of samples) {
      expect(redact(raw, "/home/antoinefa")).not.toContain(secret);
    }
  });

  it("cursors.json stores home-relative (~) paths, not raw home paths", () => {
    const repoRoot = tmp("agentstats-curs-");
    const home = tmp("agentstats-cursh-");
    const store = resolveStore(repoRoot);
    const cursors = new Map<string, FileCursor>();
    const p = join(home, ".claude", "projects", "x", "s.jsonl");
    cursors.set(p, { path: p, offset: 1, size: 1, mtimeMs: 1 });
    saveCursors(store, cursors, home);
    const raw = readFileSync(store.cursorsPath, "utf-8");
    expect(raw).not.toContain(home);
    expect(raw).toContain("~/.claude/projects/x/s.jsonl");
    // Round-trip: loading restores the absolute path keyed map.
    const loaded = loadCursors(store, home);
    expect(loaded.get(p)?.offset).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Product: residual row, weighted tokens + confidence, persisted links, wp view
// ---------------------------------------------------------------------------

describe("stats table: residual row, weighted tokens, confidence", () => {
  function rank1Fact(): SessionFact {
    const lines = [
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-06-10T10:00:00.000Z",
        cwd: "/tmp/repo",
        gitBranch: "feat/wp9",
        message: {
          model: "m",
          usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 100 },
          content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "git commit -m x" } }],
        },
      }),
      JSON.stringify({ type: "user", timestamp: "2026-06-10T10:00:01.000Z", cwd: "/tmp/repo", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "[feat/wp9 abc1234] x" }] } }),
    ].join("\n");
    return normalizeClaude(parseClaudeTranscript(lines, "w-1"));
  }

  it("reports cost-weighted tokens (cache reads discounted) and a confidence band", () => {
    const fact = rank1Fact();
    const links = correlate({ facts: [fact], instances: [], commits: [{ sha: "abc1234" + "0".repeat(33), subject: "x" }] });
    const rows = aggregate({ facts: [fact], links, instances: [] });
    const row = rows[0]!;
    // raw total = 100 + 10 + 1000 + 100 = 1210; weighted = 100 + 10 + 100 + 0.1*1000 = 310
    expect(row.tokens).toBe(1210);
    expect(row.tokensWeighted).toBe(310);
    expect(row.confidence).toBe("high");
    const table = formatStatsTable(rows);
    expect(table).toContain("CONF");
  });

  it("renders an unattributed/human residual row for honest coverage", () => {
    const repoRoot = tmp("agentstats-resid-");
    mkdirSync(join(repoRoot, ".graphify", "agents"), { recursive: true });
    writeFileSync(join(repoRoot, ".graphify", "agents", "facts.jsonl"), JSON.stringify(rank1Fact()) + "\n");
    const { rows, residual } = computeAgentStats(repoRoot, {
      injectedCommits: [
        { sha: "abc1234" + "0".repeat(33), subject: "agent work" },
        { sha: "d".repeat(40), subject: "human work" },
      ],
      skipPrMerges: true,
    });
    expect(residual).toBeDefined();
    expect(residual!.totalCommits).toBe(2);
    expect(residual!.unattributedCommits).toBe(1);
    const table = formatStatsTable(rows, residual);
    expect(table).toContain("unattributed/human");
  });

  it("persists attribution links append-only so numbers survive branch GC", () => {
    const repoRoot = tmp("agentstats-links-");
    mkdirSync(join(repoRoot, ".graphify", "agents"), { recursive: true });
    writeFileSync(join(repoRoot, ".graphify", "agents", "facts.jsonl"), JSON.stringify(rank1Fact()) + "\n");
    const first = computeAgentStats(repoRoot, {
      injectedCommits: [{ sha: "abc1234" + "0".repeat(33), subject: "x" }],
      skipPrMerges: true,
    });
    expect(first.rows[0]!.commits).toBe(1);
    expect(existsSync(join(repoRoot, ".graphify", "agents", "links.jsonl"))).toBe(true);
    // Branch GC: the sha vanished from git log. The persisted link keeps credit.
    const second = computeAgentStats(repoRoot, { injectedCommits: [], skipPrMerges: true });
    expect(second.rows[0]!.commits).toBe(1);
    // Append-only and deduped: a third run does not grow the file.
    const sizeAfterSecond = readFileSync(join(repoRoot, ".graphify", "agents", "links.jsonl"), "utf-8").length;
    computeAgentStats(repoRoot, { injectedCommits: [], skipPrMerges: true });
    const sizeAfterThird = readFileSync(join(repoRoot, ".graphify", "agents", "links.jsonl"), "utf-8").length;
    expect(sizeAfterThird).toBe(sizeAfterSecond);
  });
});

describe("agent-stats wp: mandated vs evidenced sessions", () => {
  function setupRepo(): string {
    const root = tmp("agentstats-wpv-");
    mkdirSync(join(root, ".track"), { recursive: true });
    writeFileSync(
      join(root, ".track", "events.jsonl"),
      readFileSync(new URL("./fixtures/agent-stats/track-ledger.jsonl", import.meta.url), "utf-8"),
    );
    mkdirSync(join(root, ".graphify", "agents"), { recursive: true });
    // Mandated session (WP9 thread-id) that never committed anything.
    const mandated = normalizeCodex(
      parseCodexRollout(
        JSON.stringify({ type: "session_meta", timestamp: "2026-06-09T01:00:00.000Z", payload: { id: "019ea9d4-c9f0-7832-9157-8e22c8e5d531", cwd: "/tmp/repo" } }),
        "019ea9d4-c9f0-7832-9157-8e22c8e5d531",
      ),
    );
    // Evidenced deliverer: unmandated session that committed on a wp9-labelled branch.
    const evidenced = normalizeCodex(
      parseCodexRollout(
        [
          JSON.stringify({ type: "session_meta", timestamp: "2026-06-09T02:00:00.000Z", payload: { id: "rogue-1", cwd: "/tmp/rogue" } }),
          JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "c1", arguments: JSON.stringify({ cmd: "git commit -m x", workdir: "/tmp/rogue" }) } }),
          JSON.stringify({ type: "response_item", payload: { type: "function_call_output", call_id: "c1", output: "[wp9-rogue-branch 5555555] x" } }),
        ].join("\n"),
        "rogue-1",
      ),
    );
    writeFileSync(
      join(root, ".graphify", "agents", "facts.jsonl"),
      JSON.stringify(mandated) + "\n" + JSON.stringify(evidenced) + "\n",
    );
    return root;
  }

  it("shows both mandated and evidenced sessions and flags the disagreement", () => {
    const repoRoot = setupRepo();
    const result = wpAgentStats(repoRoot, "WP9", {
      injectedCommits: [{ sha: "5555555" + "0".repeat(33), subject: "x" }],
      skipPrMerges: true,
    });
    expect(result.sessions).toHaveLength(1); // mandated
    expect(result.evidenced).toHaveLength(1); // delivered on a WP9 branch
    expect(result.evidenced[0]!.fact.sessionId).toBe("rogue-1");
    expect(result.mismatch).toBe(true);
    const view = formatWpView(result, "WP9");
    expect(view).toContain("Evidenced");
    expect(view).toMatch(/disagree|mismatch/i);
    // Per-WP rollup of tokens + commits is present.
    expect(view).toMatch(/Rollup/i);
  });
});
