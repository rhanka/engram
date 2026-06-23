/**
 * WP9 agent-stats → project/conversation graph builder tests.
 *
 * Focus = RENAME RECONCILIATION: sentropic → graphify → regraphify all collapse
 * into ONE project node, with rename-lineage edges chaining the incarnations and
 * every session/agent/branch/commit hung off the right repo.
 */

import { describe, expect, it } from "vitest";

import {
  buildProjectGraph,
  aliasForCwd,
  sessionFactToInput,
  PROJECT_GRAPH_SCHEMA,
  type ProjectIdentity,
  type SessionInput,
} from "../src/agent-stats/project-graph.js";
import type { SessionFact } from "../src/agent-stats/types.js";

const sentropicIdentity: ProjectIdentity = {
  canonicalId: "sentropic",
  label: "Sentropic / Graphify (project)",
  aliases: [
    { name: "sentropic", pathPrefixes: ["~/src/sentropic", "/home/u/src/sentropic"], remote: "rhanka/sentropic" },
    { name: "graphify", pathPrefixes: ["~/src/graphify", "/home/u/src/graphify"], remote: "rhanka/graphify" },
    { name: "regraphify", pathPrefixes: ["/tmp/regraphify"] },
  ],
};

function mkSession(over: Partial<SessionInput>): SessionInput {
  return {
    factId: over.factId ?? "claude:s1",
    host: over.host ?? "claude",
    sessionId: over.sessionId ?? "s1",
    agentId: over.agentId ?? "claude:sentropic:abc",
    cwds: over.cwds ?? ["~/src/sentropic"],
    startedAt: over.startedAt,
    endedAt: over.endedAt,
    branches: over.branches ?? [],
    commitShas: over.commitShas ?? [],
    prUrls: over.prUrls ?? [],
    tokensTotal: over.tokensTotal ?? 0,
    filesTouched: over.filesTouched ?? 0,
    parentThreadId: over.parentThreadId,
  };
}

describe("aliasForCwd", () => {
  it("maps each rename incarnation's cwd to its alias index", () => {
    expect(aliasForCwd(sentropicIdentity, "~/src/sentropic")).toBe(0);
    expect(aliasForCwd(sentropicIdentity, "~/src/graphify")).toBe(1);
    expect(aliasForCwd(sentropicIdentity, "/tmp/regraphify")).toBe(2);
  });

  it("resolves worktree subpaths to the longest-matching alias", () => {
    expect(aliasForCwd(sentropicIdentity, "~/src/graphify/.worktrees/foo")).toBe(1);
    expect(aliasForCwd(sentropicIdentity, "~/src/graphify/.claude/worktrees/agent-x")).toBe(1);
  });

  it("returns -1 for an unrelated cwd", () => {
    expect(aliasForCwd(sentropicIdentity, "~/src/other-project")).toBe(-1);
  });
});

describe("buildProjectGraph — rename reconciliation", () => {
  it("collapses sentropic + graphify + regraphify sessions into ONE project node", () => {
    const sessions = [
      mkSession({ factId: "claude:a", sessionId: "a", cwds: ["~/src/sentropic"] }),
      mkSession({ factId: "claude:b", sessionId: "b", cwds: ["~/src/graphify"] }),
      mkSession({ factId: "codex:c", sessionId: "c", host: "codex", cwds: ["/tmp/regraphify"] }),
    ];
    const g = buildProjectGraph({ identity: sentropicIdentity, sessions });

    const projects = g.nodes.filter((n) => n.node_type === "Project");
    expect(projects).toHaveLength(1);
    expect(projects[0]!.label).toBe("Sentropic / Graphify (project)");

    // Three repo (incarnation) nodes, all belonging to the one project.
    const repos = g.nodes.filter((n) => n.node_type === "Repo");
    expect(repos.map((r) => r.label).sort()).toEqual(["graphify", "regraphify", "sentropic"]);
    const belongs = g.links.filter((e) => e.relation === "belongs-to");
    expect(belongs).toHaveLength(3);
    for (const e of belongs) expect(e.target).toBe(projects[0]!.id);
  });

  it("chains the rename history with ordered rename-lineage edges", () => {
    const g = buildProjectGraph({ identity: sentropicIdentity, sessions: [] });
    const lineage = g.links.filter((e) => e.relation === "rename-lineage");
    // 3 incarnations → 2 chained edges.
    expect(lineage).toHaveLength(2);
    const ids = g.nodes.filter((n) => n.node_type === "Repo");
    const byLabel = new Map(ids.map((n) => [n.label, n.id]));
    expect(lineage[0]).toMatchObject({ source: byLabel.get("sentropic"), target: byLabel.get("graphify") });
    expect(lineage[1]).toMatchObject({ source: byLabel.get("graphify"), target: byLabel.get("regraphify") });
  });

  it("attaches a session to the repo incarnation of its cwd", () => {
    const sessions = [mkSession({ factId: "claude:b", sessionId: "b", cwds: ["~/src/graphify"] })];
    const g = buildProjectGraph({ identity: sentropicIdentity, sessions });
    const workedIn = g.links.filter((e) => e.relation === "worked-in");
    expect(workedIn).toHaveLength(1);
    const graphifyRepo = g.nodes.find((n) => n.node_type === "Repo" && n.label === "graphify")!;
    expect(workedIn[0]!.target).toBe(graphifyRepo.id);
  });

  it("excludes sessions whose cwd is not in the project's lineage", () => {
    const sessions = [
      mkSession({ factId: "claude:a", sessionId: "a", cwds: ["~/src/sentropic"] }),
      mkSession({ factId: "claude:z", sessionId: "z", cwds: ["~/src/unrelated"] }),
    ];
    const g = buildProjectGraph({ identity: sentropicIdentity, sessions });
    const sessNodes = g.nodes.filter((n) => n.node_type === "Session");
    expect(sessNodes).toHaveLength(1);
    expect(sessNodes[0]!.label).toContain(":a");
  });
});

describe("buildProjectGraph — session detail", () => {
  it("emits agent, branch and commit nodes with their edges", () => {
    const sessions = [
      mkSession({
        factId: "claude:a",
        sessionId: "a",
        cwds: ["~/src/graphify"],
        branches: ["feat/x", "main"],
        commitShas: ["abc1234", "def5678"],
        agentId: "claude:graphify:111",
      }),
    ];
    const g = buildProjectGraph({ identity: sentropicIdentity, sessions });
    expect(g.nodes.filter((n) => n.node_type === "Agent")).toHaveLength(1);
    expect(g.nodes.filter((n) => n.node_type === "Branch").map((n) => n.label).sort()).toEqual(["feat/x", "main"]);
    expect(g.nodes.filter((n) => n.node_type === "Commit")).toHaveLength(2);
    expect(g.links.filter((e) => e.relation === "conducted-by")).toHaveLength(1);
    expect(g.links.filter((e) => e.relation === "touched-branch")).toHaveLength(2);
    expect(g.links.filter((e) => e.relation === "produced")).toHaveLength(2);
  });

  it("dedupes shared agent / branch / commit nodes across sessions", () => {
    const sessions = [
      mkSession({ factId: "claude:a", sessionId: "a", cwds: ["~/src/graphify"], branches: ["main"], agentId: "claude:graphify:111" }),
      mkSession({ factId: "claude:b", sessionId: "b", cwds: ["~/src/graphify"], branches: ["main"], agentId: "claude:graphify:111" }),
    ];
    const g = buildProjectGraph({ identity: sentropicIdentity, sessions });
    expect(g.nodes.filter((n) => n.node_type === "Agent")).toHaveLength(1);
    expect(g.nodes.filter((n) => n.node_type === "Branch")).toHaveLength(1);
    // Two distinct touched-branch edges (one per session) onto the one branch node.
    expect(g.links.filter((e) => e.relation === "touched-branch")).toHaveLength(2);
  });

  it("links a codex sub-agent session to its parent (derived-from)", () => {
    const sessions = [
      mkSession({ factId: "codex:parent", sessionId: "parent", host: "codex", cwds: ["~/src/graphify"] }),
      mkSession({ factId: "codex:child", sessionId: "child", host: "codex", cwds: ["~/src/graphify"], parentThreadId: "parent" }),
    ];
    const g = buildProjectGraph({ identity: sentropicIdentity, sessions });
    const derived = g.links.filter((e) => e.relation === "derived-from");
    expect(derived).toHaveLength(1);
  });

  it("can omit commits / branches when asked", () => {
    const sessions = [mkSession({ cwds: ["~/src/graphify"], branches: ["main"], commitShas: ["abc1234"] })];
    const g = buildProjectGraph({ identity: sentropicIdentity, sessions, includeCommits: false, includeBranches: false });
    expect(g.nodes.filter((n) => n.node_type === "Commit")).toHaveLength(0);
    expect(g.nodes.filter((n) => n.node_type === "Branch")).toHaveLength(0);
  });
});

describe("graph.json shape", () => {
  it("produces a valid node-link graph the studio can read", () => {
    const g = buildProjectGraph({ identity: sentropicIdentity, sessions: [mkSession({ cwds: ["~/src/graphify"] })], provenance: { tool: "test" } });
    expect(g).toHaveProperty("directed");
    expect(g).toHaveProperty("nodes");
    expect(g).toHaveProperty("links"); // NB: "links", not "edges"
    expect(g).toHaveProperty("hyperedges");
    expect(g.graph.community_labels["0"]).toBe("Project");
    expect(g.topology_signature).toMatch(/^n=\d+;e=\d+$/);
    // Every edge references an existing node id.
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.links) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
    // Every node carries the studio-required fields.
    for (const n of g.nodes) {
      expect(n.id).toBeTruthy();
      expect(n.label).toBeTruthy();
      expect(n.file_type).toBeTruthy();
      expect(typeof n.community).toBe("number");
      expect(n.community_name).toBeTruthy();
    }
  });

  it("exports the schema constant", () => {
    expect(PROJECT_GRAPH_SCHEMA).toBe("graphify.agent-stats.project-graph/v1");
  });
});

describe("sessionFactToInput", () => {
  it("projects a SessionFact onto the minimal input, filtering HEAD branches", () => {
    const fact: SessionFact = {
      factId: "claude:x",
      host: "claude",
      sessionId: "x",
      cwds: ["~/src/graphify"],
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T01:00:00Z",
      models: ["claude-opus"],
      tokens: { input: 10, output: 5, cached: 0, total: 15 },
      gitActions: [],
      groundTruth: { commitShas: ["abc1234def", "abc1234def"], branches: ["main", "HEAD"], shaBranch: {}, prUrls: ["https://x/pull/1"] },
      branchesObserved: ["feat/y", "HEAD"],
      filesTouched: ["a.ts", "b.ts"],
      evidence: [],
      parent: { parentThreadId: "p" },
    };
    const inp = sessionFactToInput(fact, "claude:graphify:zz");
    expect(inp.agentId).toBe("claude:graphify:zz");
    expect(inp.branches).toEqual(["feat/y", "main"]); // HEAD filtered, sorted
    expect(inp.commitShas).toEqual(["abc1234"]); // 7-char, deduped
    expect(inp.filesTouched).toBe(2);
    expect(inp.parentThreadId).toBe("p");
  });
});
