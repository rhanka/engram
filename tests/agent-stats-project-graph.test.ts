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
import { buildStudioScene } from "../src/studio-scene.js";

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
    startedAtMs: over.startedAtMs,
    endedAtMs: over.endedAtMs,
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

// ---------------------------------------------------------------------------
// T0 temporal stamps: `t` / `t_end` (epoch-ms) + `t_src` (provenance) on
// Session nodes and on every edge a session OWNS (worked-in / conducted-by /
// touched-branch / produced / derived-from). Epoch-ms matches the shared scene
// contract (src/studio-scene.ts). `t_src` is graph-only provenance.
// ---------------------------------------------------------------------------
const START_ISO = "2026-01-01T00:00:00.000Z";
const END_ISO = "2026-01-01T01:00:00.000Z";
const START_MS = Date.parse(START_ISO);
const END_MS = Date.parse(END_ISO);

describe("buildProjectGraph — T0 temporal stamps", () => {
  it("stamps t/t_end/t_src on the Session node from started/ended", () => {
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [mkSession({ cwds: ["~/src/graphify"], startedAt: START_ISO, endedAt: END_ISO })],
    });
    const sess = g.nodes.find((n) => n.node_type === "Session")!;
    expect(sess.t).toBe(START_MS);
    expect(sess.t_end).toBe(END_MS);
    expect(sess.t_src).toBe("session.started_at");
  });

  it("stamps the session's t/t_end/t_src on every edge it OWNS", () => {
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [
        mkSession({
          cwds: ["~/src/graphify"],
          startedAt: START_ISO,
          endedAt: END_ISO,
          branches: ["feat/x"],
          commitShas: ["abc1234"],
          agentId: "claude:graphify:111",
        }),
      ],
    });
    const owned = g.links.filter((e) =>
      ["worked-in", "conducted-by", "touched-branch", "produced"].includes(e.relation),
    );
    expect(owned.map((e) => e.relation).sort()).toEqual([
      "conducted-by",
      "produced",
      "touched-branch",
      "worked-in",
    ]);
    for (const e of owned) {
      expect(e.t).toBe(START_MS);
      expect(e.t_end).toBe(END_MS);
      expect(e.t_src).toBe("session.started_at");
    }
  });

  it("stamps derived-from with the CHILD (source) session's t/t_end", () => {
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [
        mkSession({
          factId: "codex:parent",
          sessionId: "parent",
          host: "codex",
          cwds: ["~/src/graphify"],
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:30:00.000Z",
        }),
        mkSession({
          factId: "codex:child",
          sessionId: "child",
          host: "codex",
          cwds: ["~/src/graphify"],
          parentThreadId: "parent",
          startedAt: START_ISO,
          endedAt: END_ISO,
        }),
      ],
    });
    const derived = g.links.find((e) => e.relation === "derived-from")!;
    expect(derived.t).toBe(START_MS); // child's start, not the parent's
    expect(derived.t_end).toBe(END_MS);
    expect(derived.t_src).toBe("session.started_at");
  });

  it("omits t_end for an OPEN session (started, not ended) — open interval, not a point", () => {
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [mkSession({ cwds: ["~/src/graphify"], startedAt: START_ISO })],
    });
    const sess = g.nodes.find((n) => n.node_type === "Session")!;
    expect(sess.t).toBe(START_MS);
    expect("t_end" in sess).toBe(false);
    expect(sess.t_src).toBe("session.started_at");
    const worked = g.links.find((e) => e.relation === "worked-in")!;
    expect(worked.t).toBe(START_MS);
    expect("t_end" in worked).toBe(false);
  });

  it("prefers the explicit epoch-ms (projection-boundary value) over the ISO string", () => {
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [
        mkSession({ cwds: ["~/src/graphify"], startedAt: "ignored-iso", startedAtMs: 123456789, endedAtMs: 987654321 }),
      ],
    });
    const sess = g.nodes.find((n) => n.node_type === "Session")!;
    expect(sess.t).toBe(123456789);
    expect(sess.t_end).toBe(987654321);
  });

  it("emits NO temporal keys for a timeless session (byte-identical back-compat)", () => {
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [mkSession({ cwds: ["~/src/graphify"], branches: ["main"], commitShas: ["abc1234"] })],
    });
    const sess = g.nodes.find((n) => n.node_type === "Session")!;
    expect("t" in sess).toBe(false);
    expect("t_end" in sess).toBe(false);
    expect("t_src" in sess).toBe(false);
    for (const e of g.links) {
      expect("t" in e).toBe(false);
      expect("t_end" in e).toBe(false);
      expect("t_src" in e).toBe(false);
    }
  });
});

describe("agent-stats → studio scene carries t/t_end", () => {
  it("a session node's t/t_end survive buildStudioScene (#234 scene allowlist)", () => {
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [
        mkSession({
          factId: "claude:a",
          sessionId: "a",
          cwds: ["~/src/graphify"],
          startedAt: START_ISO,
          endedAt: END_ISO,
          branches: ["feat/x"],
        }),
      ],
    });
    // buildProjectGraph emits `links`; buildStudioScene reads links as edges.
    const scene = buildStudioScene(g);
    const sceneSession = scene.nodes.find((n) => n.type === "Session")!;
    expect(sceneSession).toBeTruthy();
    expect(sceneSession.t).toBe(START_MS);
    expect(sceneSession.t_end).toBe(END_MS);
    // A session-owned edge also carries the span into the scene.
    const ownedEdge = scene.edges.find(
      (e) => e.relation === "worked-in" || e.relation === "touched-branch",
    )!;
    expect(ownedEdge.t).toBe(START_MS);
    expect(ownedEdge.t_end).toBe(END_MS);
    // t_src is graph-only provenance — NOT in the scene allowlist.
    expect("t_src" in sceneSession).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T2 temporal: git committer-date on Commit nodes + DERIVED [min,max] spans on
// the container nodes (Branch / Agent / Project). Commit `t` is a point in time
// (t_end === t); container spans are the first/last-activity envelope of their
// owned children. Provenance: t_src = "git.committer_date" / "derived.children_span".
// ---------------------------------------------------------------------------
const COMMIT_MS = Date.parse("2026-01-01T00:30:00.000Z");

describe("buildProjectGraph — T2 git committer-date on Commit nodes", () => {
  it("stamps a Commit node with t = t_end = its git committer-date", () => {
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [
        mkSession({ cwds: ["~/src/graphify"], commitShas: ["abc1234"], startedAt: START_ISO, endedAt: END_ISO }),
      ],
      commits: [{ sha: "abc1234def", committedAtMs: COMMIT_MS }],
    });
    const commit = g.nodes.find((n) => n.node_type === "Commit")!;
    expect(commit.t).toBe(COMMIT_MS);
    expect(commit.t_end).toBe(COMMIT_MS); // a commit is a point in time
    expect(commit.t_src).toBe("git.committer_date");
  });

  it("leaves a Commit node timeless when no git committer-date matches its sha", () => {
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [mkSession({ cwds: ["~/src/graphify"], commitShas: ["abc1234"] })],
      commits: [{ sha: "fffffff", committedAtMs: COMMIT_MS }],
    });
    const commit = g.nodes.find((n) => n.node_type === "Commit")!;
    expect("t" in commit).toBe(false);
    expect("t_src" in commit).toBe(false);
  });
});

describe("buildProjectGraph — T2 derived container spans", () => {
  it("derives a Branch span [min,max] over BOTH its sessions and their commits", () => {
    const S1_START = Date.parse("2026-01-01T00:00:00.000Z");
    const S1_END = Date.parse("2026-01-01T01:00:00.000Z");
    const S2_START = Date.parse("2026-01-02T00:00:00.000Z");
    const S2_END = Date.parse("2026-01-02T01:00:00.000Z");
    const C_LATE = Date.parse("2026-01-03T00:00:00.000Z"); // commit AFTER both sessions
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [
        mkSession({ factId: "s1", sessionId: "s1", cwds: ["~/src/graphify"], branches: ["feat/x"], startedAtMs: S1_START, endedAtMs: S1_END }),
        mkSession({ factId: "s2", sessionId: "s2", cwds: ["~/src/graphify"], branches: ["feat/x"], commitShas: ["abc1234"], startedAtMs: S2_START, endedAtMs: S2_END }),
      ],
      commits: [{ sha: "abc1234", committedAtMs: C_LATE }],
    });
    const branch = g.nodes.find((n) => n.node_type === "Branch" && n.label === "feat/x")!;
    expect(branch.t).toBe(S1_START); // earliest = first session's start
    expect(branch.t_end).toBe(C_LATE); // latest = the commit, after both sessions
    expect(branch.t_src).toBe("derived.children_span");
  });

  it("derives an Agent span [min,max] over the sessions it conducted", () => {
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [
        mkSession({ factId: "s1", sessionId: "s1", agentId: "claude:graphify:111", cwds: ["~/src/graphify"], startedAtMs: 1000, endedAtMs: 2000 }),
        mkSession({ factId: "s2", sessionId: "s2", agentId: "claude:graphify:111", cwds: ["~/src/graphify"], startedAtMs: 5000, endedAtMs: 9000 }),
      ],
    });
    const agent = g.nodes.find((n) => n.node_type === "Agent")!;
    expect(agent.t).toBe(1000);
    expect(agent.t_end).toBe(9000);
    expect(agent.t_src).toBe("derived.children_span");
  });

  it("derives the Project span as the global session envelope", () => {
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [
        mkSession({ factId: "s1", sessionId: "s1", cwds: ["~/src/sentropic"], startedAtMs: 3000, endedAtMs: 4000 }),
        mkSession({ factId: "s2", sessionId: "s2", cwds: ["~/src/graphify"], startedAtMs: 1000, endedAtMs: 8000 }),
      ],
    });
    const project = g.nodes.find((n) => n.node_type === "Project")!;
    expect(project.t).toBe(1000);
    expect(project.t_end).toBe(8000);
    expect(project.t_src).toBe("derived.children_span");
  });

  it("leaves Branch / Agent / Project timeless when no child carries a timestamp", () => {
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [
        mkSession({ cwds: ["~/src/graphify"], branches: ["feat/x"], commitShas: ["abc1234"], agentId: "claude:graphify:111" }),
      ],
    });
    for (const type of ["Branch", "Agent", "Project"]) {
      const n = g.nodes.find((x) => x.node_type === type)!;
      expect("t" in n).toBe(false);
      expect("t_end" in n).toBe(false);
      expect("t_src" in n).toBe(false);
    }
  });
});

describe("agent-stats → studio scene carries the T2 commit/branch t", () => {
  it("carries the commit committer-date and derived branch span through buildStudioScene", () => {
    const C_LATE = Date.parse("2026-01-01T02:00:00.000Z"); // after the session end
    const g = buildProjectGraph({
      identity: sentropicIdentity,
      sessions: [
        mkSession({
          factId: "claude:a",
          sessionId: "a",
          cwds: ["~/src/graphify"],
          startedAt: START_ISO,
          endedAt: END_ISO,
          branches: ["feat/x"],
          commitShas: ["abc1234"],
        }),
      ],
      commits: [{ sha: "abc1234", committedAtMs: C_LATE }],
    });
    const scene = buildStudioScene(g);
    // Commit node: committer-date survives as a point-in-time.
    const sceneCommit = scene.nodes.find((n) => n.type === "Commit")!;
    expect(sceneCommit.t).toBe(C_LATE);
    expect(sceneCommit.t_end).toBe(C_LATE);
    // Branch node: derived span [session start, commit] survives the allowlist.
    const sceneBranch = scene.nodes.find((n) => n.type === "Branch")!;
    expect(sceneBranch.t).toBe(START_MS);
    expect(sceneBranch.t_end).toBe(C_LATE); // widened by the later commit
    // t_src is graph-only provenance — NOT carried into the scene.
    expect("t_src" in sceneBranch).toBe(false);
    expect("t_src" in sceneCommit).toBe(false);
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
    // T0 projection boundary: ISO started/ended also carried as epoch-ms.
    expect(inp.startedAtMs).toBe(Date.parse("2026-01-01T00:00:00Z"));
    expect(inp.endedAtMs).toBe(Date.parse("2026-01-01T01:00:00Z"));
  });

  it("leaves the epoch-ms undefined when the fact has no started/ended", () => {
    const fact: SessionFact = {
      factId: "claude:n",
      host: "claude",
      sessionId: "n",
      cwds: ["~/src/graphify"],
      models: [],
      tokens: { input: 0, output: 0, cached: 0, total: 0 },
      gitActions: [],
      groundTruth: { commitShas: [], branches: [], shaBranch: {}, prUrls: [] },
      branchesObserved: [],
      filesTouched: [],
      evidence: [],
    };
    const inp = sessionFactToInput(fact, "claude:graphify:zz");
    expect(inp.startedAtMs).toBeUndefined();
    expect(inp.endedAtMs).toBeUndefined();
  });
});
