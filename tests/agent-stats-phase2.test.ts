/**
 * WP9 agent-stats — Phase 2 tests.
 *
 *   1. Structured output: stable `graphify.agent-stats/v1` JSON report
 *      (agents, branches, commits, features, anonymized citations, confidence,
 *      token cost), sessions report, markdown rendering, conflict surface.
 *   2. agy/Gemini parser robustness: multi-session files, `$set.messages`
 *      patches, tolerant tool-call shapes, verb-gated ground truth (parity
 *      with Claude/Codex), corrupt-line skip, usageMetadata tokens.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { parseAgyChat, parseAgyChats } from "../src/agent-stats/agy-chat.js";
import { correlate, detectCommitConflicts, type PrMergeMeta } from "../src/agent-stats/correlate.js";
import { emptyGroundTruth } from "../src/agent-stats/git-evidence.js";
import { agyProjectHash, factInRepo, makeRepoScope, normalizeAgy } from "../src/agent-stats/normalize.js";
import { computeAgentStats, syncAgentStats } from "../src/agent-stats/index.js";
import {
  AGENT_STATS_SCHEMA,
  SESSIONS_SCHEMA,
  buildReport,
  buildSessionsReport,
  featureFromBranch,
  formatReportMarkdown,
} from "../src/agent-stats/report.js";
import { aggregate, formatStatsTable } from "../src/agent-stats/stats.js";
import type { H2aInstance } from "../src/agent-stats/registry.js";
import type { AgentStatsRow, CorrelationLink, SessionFact } from "../src/agent-stats/types.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(d);
  return d;
}

function loadFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/agent-stats/${name}`, import.meta.url), "utf-8");
}

function makeFact(overrides: Partial<SessionFact> = {}): SessionFact {
  return {
    factId: "claude:s-1",
    host: "claude",
    sessionId: "s-1",
    cwds: ["~/src/graphify"],
    startedAt: "2026-06-01T10:00:00.000Z",
    endedAt: "2026-06-01T11:00:00.000Z",
    models: ["claude-fable-5"],
    tokens: { input: 1000, output: 200, cached: 5000, total: 6200 },
    gitActions: [],
    groundTruth: emptyGroundTruth(),
    branchesObserved: ["feat/wp9-agent-stats"],
    filesTouched: ["~/src/graphify/src/x.ts"],
    evidence: [
      { kind: "git-commit", text: "git commit -m x => [feat/wp9-agent-stats abc1234] x", timestamp: "2026-06-01T10:30:00.000Z" },
      { kind: "git-push", text: "git push origin HEAD", timestamp: "2026-06-01T10:40:00.000Z" },
    ],
    ...overrides,
  };
}

const AGENT = "claude:graphify:17bddf135979";

function makeRow(overrides: Partial<AgentStatsRow> = {}): AgentStatsRow {
  return {
    agentId: AGENT,
    host: "claude",
    registered: true,
    sessions: 1,
    tokens: 6200,
    tokensWeighted: 1700,
    confidence: "high",
    commits: 1,
    branches: 1,
    wpsTouched: ["WP9"],
    lastActive: "2026-06-01T11:00:00.000Z",
    ...overrides,
  };
}

function commitLink(overrides: Partial<CorrelationLink> = {}): CorrelationLink {
  return {
    factId: "claude:s-1",
    agentId: AGENT,
    target: { kind: "commit", sha: "abc1234def0000000000000000000000000000ff", branch: "feat/wp9-agent-stats" },
    rank: 1,
    rule: "commit-sha-output",
    confidence: "high",
    evidence: 'session printed "[feat/wp9-agent-stats abc1234]" in a git commit output; sha is present in git log',
    ...overrides,
  };
}

const instances: H2aInstance[] = [
  { id: AGENT, host: "claude", name: "graphify", workspacePath: "~/src/graphify", label: "graphify" },
];

describe("phase2: structured report (graphify.agent-stats/v1)", () => {
  it("builds the documented schema: agents, branches, commits, features, citations, residual", () => {
    const report = buildReport({
      rows: [makeRow()],
      links: [commitLink()],
      facts: [makeFact()],
      instances,
      residual: { totalCommits: 10, unattributedCommits: 4 },
      conflicts: [],
    });
    expect(report.schema).toBe(AGENT_STATS_SCHEMA);
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.residual).toEqual({ totalCommits: 10, unattributedCommits: 4 });
    expect(report.conflicts).toEqual([]);

    expect(report.agents).toHaveLength(1);
    const a = report.agents[0]!;
    expect(a.agentId).toBe(AGENT);
    expect(a.host).toBe("claude");
    expect(a.registered).toBe(true);
    expect(a.sessions).toBe(1);
    expect(a.tokens).toEqual({ raw: 6200, weighted: 1700 });
    expect(a.confidence).toBe("high");
    expect(a.branches).toEqual(["feat/wp9-agent-stats"]);
    expect(a.wps).toEqual(["WP9"]);
    expect(a.features).toEqual(["wp9-agent-stats"]);
    expect(a.commits).toHaveLength(1);
    expect(a.commits[0]).toMatchObject({
      sha: "abc1234def0000000000000000000000000000ff",
      branch: "feat/wp9-agent-stats",
      rule: "commit-sha-output",
      confidence: "high",
    });
    expect(a.commits[0]!.evidence).toContain("abc1234");
    // Citations are the session's anonymized evidence snippets, strongest first.
    expect(a.citations.length).toBeGreaterThanOrEqual(2);
    expect(a.citations[0]!.kind).toBe("git-commit");
  });

  it("dedupes the pr-merge squash commit against a rank-1 branch (same counts as the table)", () => {
    const squash = commitLink({
      target: { kind: "commit", sha: "9999999000000000000000000000000000000000", branch: "feat/wp9-agent-stats" },
      rank: 2,
      rule: "pr-merge",
      evidence: "PR #1 merged it",
    });
    const report = buildReport({
      rows: [makeRow()],
      links: [commitLink(), squash],
      facts: [makeFact()],
      instances,
    });
    // The squash commit is the SAME unit of work — one commit, not two.
    expect(report.agents[0]!.commits).toHaveLength(1);
    expect(report.agents[0]!.commits[0]!.rule).toBe("commit-sha-output");
  });

  it("never leaks raw home paths or emails through the report JSON", () => {
    const report = buildReport({
      rows: [makeRow()],
      links: [commitLink()],
      facts: [makeFact()],
      instances,
    });
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/\/home\/[A-Za-z0-9._-]+\//);
    expect(json).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });

  it("caps citations per agent", () => {
    const evidence = Array.from({ length: 12 }, (_, i) => ({
      kind: "git-commit" as const,
      text: `git commit ${i}`,
    }));
    const report = buildReport({
      rows: [makeRow()],
      links: [],
      facts: [makeFact({ evidence })],
      instances,
    });
    expect(report.agents[0]!.citations.length).toBeLessThanOrEqual(5);
  });

  it("derives feature labels from branch conventions", () => {
    expect(featureFromBranch("feat/render-parity")).toBe("render-parity");
    expect(featureFromBranch("fix-recon-overlap")).toBe("recon-overlap");
    expect(featureFromBranch("wp1-repo-keys")).toBe("repo-keys");
    expect(featureFromBranch("main")).toBeNull();
  });

  it("renders markdown with the summary table, per-agent sections and citations", () => {
    const md = formatReportMarkdown(
      buildReport({
        rows: [makeRow()],
        links: [commitLink()],
        facts: [makeFact()],
        instances,
        residual: { totalCommits: 10, unattributedCommits: 4 },
      }),
    );
    expect(md).toContain("# Agent stats");
    expect(md).toContain(`## ${AGENT}`);
    expect(md).toContain("| `claude:graphify:17bddf135979` |");
    expect(md).toContain("(unattributed/human)");
    expect(md).toContain("`abc1234` on `feat/wp9-agent-stats` (commit-sha-output, high)");
    expect(md).toContain("[git-commit]");
  });
});

describe("phase2: sessions report (graphify.agent-stats.sessions/v1)", () => {
  it("builds session entries with resolved agent identity (never a git author)", () => {
    const gt = emptyGroundTruth();
    gt.commitShas.push("abc1234");
    gt.branches.push("feat/wp9-agent-stats");
    const report = buildSessionsReport([makeFact({ groundTruth: gt })], instances);
    expect(report.schema).toBe(SESSIONS_SCHEMA);
    expect(report.sessions).toHaveLength(1);
    const s = report.sessions[0]!;
    expect(s.agentId).toBe(AGENT);
    expect(s.registered).toBe(true);
    expect(s.commitShas).toEqual(["abc1234"]);
    expect(s.branches).toContain("feat/wp9-agent-stats");
    expect(s.filesTouched).toBe(1);
    expect(s.citations.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toMatch(/\/home\/[A-Za-z0-9._-]+\//);
  });
});

describe("phase2: commit conflicts (same sha claimed by several agents)", () => {
  it("flags a commit claimed by two distinct agents, strongest rank first", () => {
    const other = commitLink({
      factId: "codex:s-2",
      agentId: "codex:graphify:aaaabbbbcccc",
      rank: 2,
      rule: "pr-merge",
      confidence: "high",
    });
    const conflicts = detectCommitConflicts([commitLink(), other]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.sha).toBe("abc1234");
    expect(conflicts[0]!.agents.map((a) => a.agentId)).toEqual([AGENT, "codex:graphify:aaaabbbbcccc"]);
  });

  it("does NOT flag the same agent claiming a commit from two sessions (resumed session)", () => {
    const resumed = commitLink({ factId: "claude:s-9" });
    expect(detectCommitConflicts([commitLink(), resumed])).toEqual([]);
  });

  it("surfaces conflicts as a WARNING in the text table", () => {
    const out = formatStatsTable([makeRow()], undefined, [
      {
        sha: "abc1234",
        branch: "feat/wp9-agent-stats",
        agents: [
          { agentId: AGENT, rule: "commit-sha-output" },
          { agentId: "codex:x:unregistered", rule: "pr-merge" },
        ],
      },
    ]);
    expect(out).toContain("WARNING: 1 commit(s) claimed by more than one agent");
    expect(out).toContain("abc1234 (feat/wp9-agent-stats)");
  });
});

// ---------------------------------------------------------------------------
// 2. agy / Gemini parser robustness
// ---------------------------------------------------------------------------

describe("phase2: agy parser robustness", () => {
  const REPO = "/tmp/repo";
  function fixture(hash = "hash-1"): string {
    return loadFixture("agy-tool-calls.jsonl").split("__REPO__").join(REPO).split("__HASH__").join(hash);
  }
  const OPTS = { scopeRoot: REPO, originRepo: "rhanka/graphify" };

  it("splits a multi-session file into one session per header", () => {
    const sessions = parseAgyChats(fixture(), "file-hint", "", OPTS);
    expect(sessions.map((s) => s.sessionId)).toEqual(["agy-sess-1", "agy-sess-2"]);
    expect(sessions[0]!.projectHash).toBe("hash-1");
  });

  it("extracts git verbs + verb-gated ground truth from tool calls (parity with claude/codex)", () => {
    const [s1, s2] = parseAgyChats(fixture(), "file-hint", "", OPTS);
    // checkout -b and commit recorded as git actions:
    expect(s1!.gitActions.map((a) => a.verb)).toContain("checkout-b");
    expect(s1!.gitActions.map((a) => a.verb)).toContain("commit");
    // the commit OUTPUT is scraped (real ground truth):
    expect(s1!.groundTruth.commitShas).toContain("deadb9a");
    expect(s1!.groundTruth.shaBranch["deadb9a"]).toBe("feat/agy-parse");
    // SPOOF: a `cat` of a foreign CI log never acquires its sha / PR url:
    expect(s1!.groundTruth.commitShas).not.toContain("1234567");
    expect(s1!.groundTruth.prUrls).toEqual([]);
    // CROSS-REPO: a commit with a foreign cwd is not credited:
    expect(s1!.groundTruth.commitShas).not.toContain("beadfee");
    // second session: `tool_call` shape with input/cmd/workdir variants:
    expect(s2!.gitActions.map((a) => a.verb)).toContain("push");
  });

  it("captures cwd/files, sums tokens incl. $set.messages and usageMetadata, skips corrupt lines", () => {
    const [s1] = parseAgyChats(fixture(), "file-hint", "", OPTS);
    expect(s1!.cwds).toContain(REPO);
    expect(s1!.filesTouched).toContain(`${REPO}/src/agy.ts`);
    // tokens: 1900 (gemini) + 150 (usageMetadata inside $set.messages);
    // the truncated token line is skipped, not fatal.
    expect(s1!.tokens.total).toBe(2050);
    expect(s1!.tokens.input).toBe(1300);
    expect(s1!.tokens.cached).toBe(420);
    expect(s1!.models).toContain("gemini-3-pro");
  });

  it("redacts evidence excerpts (emails, home paths) before storing", () => {
    const [s1] = parseAgyChats(fixture(), "file-hint", "", OPTS);
    const all = JSON.stringify(s1!.evidence);
    expect(s1!.evidence.length).toBeGreaterThan(0);
    expect(all).not.toContain("fabien.antoine@example.com");
    expect(all).not.toMatch(/\/home\/antoinefa/);
  });

  it("parseAgyChat (back-compat) returns the first session", () => {
    const s = parseAgyChat(fixture(), "file-hint", "", OPTS);
    expect(s.sessionId).toBe("agy-sess-1");
  });

  it("never throws on garbage / empty / truncated content", () => {
    expect(parseAgyChats("", "hint")).toHaveLength(1);
    expect(parseAgyChats('  not json\n{"half":', "hint")[0]!.sessionId).toBe("hint");
    expect(parseAgyChats('{"$set":{"messages":"not-an-array"}}\n{"type":"gemini","tokens":null}', "hint")).toHaveLength(1);
  });

  it("factInRepo accepts an agy fact via projectHash OR captured cwd", () => {
    const scope = makeRepoScope(REPO);
    const byHash = normalizeAgy(parseAgyChats(fixture(agyProjectHash(REPO)), "hint", "", OPTS)[0]!);
    expect(factInRepo(byHash, scope, agyProjectHash(REPO))).toBe(true);
    // hash unknown, but the session recorded an in-repo cwd:
    const byCwd = normalizeAgy(parseAgyChats(fixture("other-hash"), "hint", "", OPTS)[0]!);
    expect(factInRepo(byCwd, scope, "other-hash")).toBe(true);
    // neither hash nor cwd match:
    const foreign = normalizeAgy(parseAgyChats('{"sessionId":"x","kind":"main"}', "x")[0]!);
    expect(factInRepo(foreign, scope, "nope")).toBe(false);
  });

  it("end-to-end: agy sessions sync from ~/.gemini and earn rank-1 attribution", () => {
    const repoRoot = tmp("agy-e2e-repo-");
    const home = tmp("agy-e2e-home-");
    const hash = agyProjectHash(repoRoot);
    const chatsDir = join(home, ".gemini", "tmp", hash, "chats");
    mkdirSync(chatsDir, { recursive: true });
    writeFileSync(
      join(chatsDir, "session-20260605-abc.jsonl"),
      loadFixture("agy-tool-calls.jsonl").split("__REPO__").join(repoRoot).split("__HASH__").join(hash),
    );

    const sync = syncAgentStats({ repoRoot, home });
    expect(sync.inRepo).toBe(2); // both logical sessions of the file

    const { rows, links } = computeAgentStats(repoRoot, {
      injectedCommits: [{ sha: "deadb9a0000000000000000000000000000000aa", subject: "feat: agy parse" }],
      skipPrMerges: true,
    });
    const rank1 = links.find((l) => l.rule === "commit-sha-output" && l.factId === "agy:agy-sess-1");
    expect(rank1).toBeDefined();
    expect(rank1!.target).toMatchObject({ kind: "commit", branch: "feat/agy-parse" });
    const agyRow = rows.find((r) => r.host === "agy" && r.commits >= 1);
    expect(agyRow).toBeDefined();
    expect(agyRow!.agentId).not.toBe("antoinefa");

    // persisted facts stay anonymized.
    const factsRaw = readFileSync(join(repoRoot, ".graphify", "agents", "facts.jsonl"), "utf-8");
    expect(factsRaw).not.toContain("fabien.antoine@example.com");
    expect(factsRaw).not.toMatch(/\/home\/[A-Za-z0-9._-]+\//);
  });
});

// ---------------------------------------------------------------------------
// 3. Attribution quality: committer precedence + adversarial cases
// ---------------------------------------------------------------------------

describe("phase2: attribution quality (adversarial)", () => {
  const BRANCH = "feat/z";
  const MERGE_SHA = "f".repeat(40);
  const prMerges: PrMergeMeta[] = [{ number: 7, branch: BRANCH, mergeCommit: MERGE_SHA }];

  /** A session that only CREATED the branch (checkout -b), never committed. */
  function creatorFact(): SessionFact {
    return makeFact({
      factId: "claude:creator",
      sessionId: "creator",
      gitActions: [{ verb: "checkout-b", command: `git checkout -b ${BRANCH}` }],
      groundTruth: emptyGroundTruth(),
      branchesObserved: [BRANCH],
      evidence: [],
    });
  }

  /** A session whose own `git commit` output named the branch. */
  function committerFact(): SessionFact {
    const gt = emptyGroundTruth();
    gt.commitShas.push("abc1234");
    gt.branches.push(BRANCH);
    gt.shaBranch["abc1234"] = BRANCH;
    return makeFact({
      factId: "codex:committer",
      host: "codex",
      sessionId: "committer",
      cwds: ["~/elsewhere"], // unregistered → synthetic id, distinct from creator
      gitActions: [{ verb: "commit", command: "git commit -m x" }],
      groundTruth: gt,
      branchesObserved: [BRANCH],
      evidence: [],
    });
  }

  it("branch creator does NOT steal the squash commit when another session committed", () => {
    const links = correlate({
      facts: [creatorFact(), committerFact()],
      instances: [],
      commits: [],
      prMerges,
    });
    const prLinks = links.filter((l) => l.rule === "pr-merge");
    expect(prLinks).toHaveLength(1);
    expect(prLinks[0]!.factId).toBe("codex:committer");
    expect(prLinks[0]!.evidence).toContain("committed on");
  });

  it("creator keeps the squash credit when NOBODY committed on the branch", () => {
    const links = correlate({ facts: [creatorFact()], instances: [], commits: [], prMerges });
    const prLinks = links.filter((l) => l.rule === "pr-merge");
    expect(prLinks).toHaveLength(1);
    expect(prLinks[0]!.factId).toBe("claude:creator");
    expect(prLinks[0]!.evidence).toContain("created");
  });

  it("a merely-OBSERVED branch still earns nothing (spoof resistance preserved)", () => {
    const observer = makeFact({
      factId: "claude:observer",
      sessionId: "observer",
      gitActions: [],
      groundTruth: emptyGroundTruth(),
      branchesObserved: [BRANCH],
      evidence: [],
    });
    const links = correlate({ facts: [observer], instances: [], commits: [], prMerges });
    expect(links.filter((l) => l.rule === "pr-merge")).toHaveLength(0);
  });

  it("a printed sha ABSENT from git log earns no rank-1 link", () => {
    const fact = committerFact();
    const links = correlate({ facts: [fact], instances: [], commits: [{ sha: "0123456".padEnd(40, "0") }] });
    expect(links.filter((l) => l.rule === "commit-sha-output")).toHaveLength(0);
  });

  it("two agents claiming the same commit surface as a conflict (not silently merged)", () => {
    const a = committerFact();
    const b = { ...committerFact(), factId: "claude:second", sessionId: "second", host: "claude" as const, cwds: ["~/src/graphify"] };
    const links = correlate({
      facts: [a, b],
      instances: [
        { id: AGENT, host: "claude", name: "graphify", workspacePath: "~/src/graphify", label: "graphify" },
      ],
      commits: [{ sha: "abc1234" + "0".repeat(33), subject: "x" }],
    });
    const conflicts = detectCommitConflicts(links);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.sha).toBe("abc1234");
    expect(conflicts[0]!.agents.length).toBe(2);
  });

  it("squash dedupe + committer precedence agree end-to-end: one unit of work, one owner", () => {
    const committer = committerFact();
    const links = correlate({
      facts: [creatorFact(), committer],
      instances: [],
      commits: [{ sha: "abc1234" + "0".repeat(33), subject: "x" }],
      prMerges,
    });
    const rows = aggregate({ facts: [creatorFact(), committer], links, instances: [] });
    const committerRow = rows.find((r) => r.host === "codex");
    // rank-1 branch commit + its squash dedupe to ONE commit for the committer.
    expect(committerRow!.commits).toBe(1);
    // the creator got no commit at all.
    const creatorRow = rows.find((r) => r.host === "claude");
    expect(creatorRow?.commits ?? 0).toBe(0);
  });
});
