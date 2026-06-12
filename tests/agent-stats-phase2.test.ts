/**
 * WP9 agent-stats — Phase 2 tests.
 *
 *   1. Structured output: stable `graphify.agent-stats/v1` JSON report
 *      (agents, branches, commits, features, anonymized citations, confidence,
 *      token cost), sessions report, markdown rendering, conflict surface.
 */

import { describe, expect, it } from "vitest";

import { detectCommitConflicts } from "../src/agent-stats/correlate.js";
import { emptyGroundTruth } from "../src/agent-stats/git-evidence.js";
import {
  AGENT_STATS_SCHEMA,
  SESSIONS_SCHEMA,
  buildReport,
  buildSessionsReport,
  featureFromBranch,
  formatReportMarkdown,
} from "../src/agent-stats/report.js";
import { formatStatsTable } from "../src/agent-stats/stats.js";
import type { H2aInstance } from "../src/agent-stats/registry.js";
import type { AgentStatsRow, CorrelationLink, SessionFact } from "../src/agent-stats/types.js";

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
