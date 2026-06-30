import { afterEach, describe, expect, it } from "vitest";

import {
  applySceneLayout,
  attachTimeOrientedPositions,
  resolveSceneLayoutId,
  resolveTimeOrientedSceneOptions,
} from "../src/scene-layout.js";
import { buildStudioScene, type StudioSceneGraphLike } from "../src/studio-scene.js";

// Epoch-ms instants (out of chronological node order so X ordering is observable).
const T_1887 = Date.UTC(1887, 2, 1);
const T_1891 = Date.UTC(1891, 4, 4);
const T_1893 = Date.UTC(1893, 11, 1);

// A small typed + temporal corpus. buildStudioScene carries `t` (#234) onto each
// scene node and resolves `type`, which Variant E bands on (Y) / orders by (X).
const GRAPH: StudioSceneGraphLike = {
  nodes: [
    { id: "n1", label: "Sherlock", type: "Character", t: T_1891 },
    { id: "n2", label: "Baker Street", type: "Location", t: T_1887 },
    { id: "n3", label: "Watson", type: "Character", t: T_1893 },
    { id: "n4", label: "Untimed Clue", type: "Evidence" }, // no `t` ⇒ untimed
  ],
  links: [{ source: "n1", target: "n2", relation: "lives_at" }],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("scene layout selection — Variant E time-oriented", () => {
  it("selecting 'time-oriented' STAMPS layout_id + layout_dims on the scene", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "time-oriented");
    expect(scene.layout_id).toBe("time-oriented");
    expect(scene.layout_dims).toBe(2);
  });

  it("pins x/y AND fx/fy, ordering timed nodes by `t` on X", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "time-oriented");
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    for (const node of scene.nodes) {
      expect(typeof node.x).toBe("number");
      expect(typeof node.y).toBe("number");
      expect(node.fx).toBe(node.x);
      expect(node.fy).toBe(node.y);
    }
    // n2 (1887) is oldest, n3 (1893) is newest ⇒ x(n2) < x(n1) < x(n3).
    expect(byId.get("n2")!.x!).toBeLessThan(byId.get("n1")!.x!);
    expect(byId.get("n1")!.x!).toBeLessThan(byId.get("n3")!.x!);
  });

  it("bands by type on Y (same type shares a lane)", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "time-oriented");
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    expect(byId.get("n1")!.y).toBe(byId.get("n3")!.y); // both Character
    expect(byId.get("n1")!.y).not.toBe(byId.get("n2")!.y); // Character vs Location
  });

  it("parks an UNTIMED node left of every timed node (deterministic untimed rail)", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "time-oriented");
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    const untimedX = byId.get("n4")!.x!;
    expect(Number.isFinite(untimedX)).toBe(true);
    for (const id of ["n1", "n2", "n3"]) {
      expect(untimedX).toBeLessThan(byId.get(id)!.x!);
    }
  });

  it("the DEFAULT ('force') does NOT stamp layout_id (back-compat byte-identity)", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "force");
    expect("layout_id" in scene).toBe(false);
    expect("layout_dims" in scene).toBe(false);
  });

  it("attachTimeOrientedPositions stamps the contract directly", () => {
    const scene = attachTimeOrientedPositions(buildStudioScene(clone(GRAPH)));
    expect(scene.layout_id).toBe("time-oriented");
    expect(scene.layout_dims).toBe(2);
  });
});

describe("resolveSceneLayoutId — time-oriented opt-in (default stays force)", () => {
  const prior = process.env.GRAPHIFY_LAYOUT;
  afterEach(() => {
    if (prior === undefined) delete process.env.GRAPHIFY_LAYOUT;
    else process.env.GRAPHIFY_LAYOUT = prior;
  });

  it("defaults to 'force' when unset", () => {
    delete process.env.GRAPHIFY_LAYOUT;
    expect(resolveSceneLayoutId()).toBe("force");
  });

  it("reads GRAPHIFY_LAYOUT=time-oriented (case-insensitive)", () => {
    process.env.GRAPHIFY_LAYOUT = "Time-Oriented";
    expect(resolveSceneLayoutId()).toBe("time-oriented");
  });

  it("still reads typed-layer + falls back to force for anything else", () => {
    process.env.GRAPHIFY_LAYOUT = "typed-layer";
    expect(resolveSceneLayoutId()).toBe("typed-layer");
    process.env.GRAPHIFY_LAYOUT = "bogus";
    expect(resolveSceneLayoutId()).toBe("force");
  });

  it("an explicit arg overrides the env", () => {
    process.env.GRAPHIFY_LAYOUT = "time-oriented";
    expect(resolveSceneLayoutId("force")).toBe("force");
  });
});

// A mini agent-stats PROJECT graph: 1 Project, 2 Repos (rename lineage), 1 Agent,
// 2 Sessions, a Branch + Commit owned by repoA's session. buildStudioScene carries
// `type` (from node_type) + `t` onto scene nodes; the derivation reads scene edges.
const T_JAN = Date.UTC(2026, 0, 1);
const T_FEB = Date.UTC(2026, 1, 1);
const T_MAR = Date.UTC(2026, 2, 1);
const T_APR = Date.UTC(2026, 3, 1);
const PROJECT_GRAPH: StudioSceneGraphLike = {
  nodes: [
    { id: "proj", label: "Project", type: "Project" },
    { id: "repo_a", label: "repoA", type: "Repo" },
    { id: "repo_b", label: "repoB", type: "Repo" },
    { id: "agent_1", label: "agent", type: "Agent" },
    { id: "sess_a", label: "sa", type: "Session", t: T_JAN },
    { id: "branch_a", label: "ba", type: "Branch", t: T_FEB },
    { id: "commit_a", label: "ca", type: "Commit", t: T_APR },
    { id: "sess_b", label: "sb", type: "Session", t: T_MAR },
  ],
  links: [
    { source: "repo_a", target: "proj", relation: "belongs-to" },
    { source: "repo_b", target: "proj", relation: "belongs-to" },
    { source: "repo_a", target: "repo_b", relation: "rename-lineage" },
    { source: "sess_a", target: "repo_a", relation: "worked-in" },
    { source: "sess_b", target: "repo_b", relation: "worked-in" },
    { source: "sess_a", target: "agent_1", relation: "conducted-by" },
    { source: "sess_b", target: "agent_1", relation: "conducted-by" },
    { source: "sess_a", target: "branch_a", relation: "touched-branch" },
    { source: "sess_a", target: "commit_a", relation: "produced" },
  ],
};

describe("scene Variant E — lanes by REPO (laneBy: 'repo')", () => {
  it("bands each node into its owning repo lane (intra-repo nodes share a band)", () => {
    const scene = attachTimeOrientedPositions(buildStudioScene(clone(PROJECT_GRAPH)), {
      laneBy: "repo",
    });
    const y = new Map(scene.nodes.map((n) => [n.id, n.y]));
    // repoA's session + the branch/commit it owns all sit in ONE lane (loops local).
    expect(y.get("sess_a")).toBe(y.get("repo_a"));
    expect(y.get("branch_a")).toBe(y.get("repo_a"));
    expect(y.get("commit_a")).toBe(y.get("repo_a"));
    // repoB's session sits in a DIFFERENT lane → inter-repo edges span lanes.
    expect(y.get("sess_b")).toBe(y.get("repo_b"));
    expect(y.get("repo_a")).not.toBe(y.get("repo_b"));
    // The Agent groups into its own lane, distinct from both repos.
    expect(y.get("agent_1")).not.toBe(y.get("repo_a"));
    expect(y.get("agent_1")).not.toBe(y.get("repo_b"));
  });

  it("still orders timed nodes by `t` on X under repo lanes", () => {
    const scene = attachTimeOrientedPositions(buildStudioScene(clone(PROJECT_GRAPH)), {
      laneBy: "repo",
    });
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    // sess_a (Jan) older than sess_b (Mar) → x(sess_a) < x(sess_b).
    expect(byId.get("sess_a")!.x!).toBeLessThan(byId.get("sess_b")!.x!);
    for (const n of scene.nodes) {
      expect(n.fx).toBe(n.x);
      expect(n.fy).toBe(n.y);
    }
  });

  it("subLaneBy='node_type' splits a repo lane into closely-spaced type sub-lines", () => {
    const scene = attachTimeOrientedPositions(buildStudioScene(clone(PROJECT_GRAPH)), {
      laneBy: "repo",
      subLaneBy: "node_type",
    });
    const y = new Map(scene.nodes.map((n) => [n.id, n.y!]));
    // Inside repoA's lane the three types now sit on distinct sub-lines.
    const ys = [y.get("sess_a")!, y.get("branch_a")!, y.get("commit_a")!];
    expect(new Set(ys).size).toBe(3);
    // …but they stay CLOSE: the sub-spread within repoA is tighter than the gap
    // to repoB's lane.
    const subSpread = Math.max(...ys) - Math.min(...ys);
    const laneGap = Math.abs(y.get("repo_b")! - y.get("repo_a")!);
    expect(subSpread).toBeLessThan(laneGap);
  });

  it("DEFAULT (no options) still bands by TYPE — back-compat for the project graph", () => {
    const scene = attachTimeOrientedPositions(buildStudioScene(clone(PROJECT_GRAPH)));
    const y = new Map(scene.nodes.map((n) => [n.id, n.y]));
    // Both Sessions share the type lane regardless of repo.
    expect(y.get("sess_a")).toBe(y.get("sess_b"));
    expect(y.get("sess_a")).not.toBe(y.get("branch_a"));
  });
});

describe("resolveTimeOrientedSceneOptions — env-driven lane controls", () => {
  const priorLane = process.env.GRAPHIFY_LANE_BY;
  const priorSub = process.env.GRAPHIFY_SUBLANE_BY;
  afterEach(() => {
    if (priorLane === undefined) delete process.env.GRAPHIFY_LANE_BY;
    else process.env.GRAPHIFY_LANE_BY = priorLane;
    if (priorSub === undefined) delete process.env.GRAPHIFY_SUBLANE_BY;
    else process.env.GRAPHIFY_SUBLANE_BY = priorSub;
  });

  it("returns {} (type lanes, byte-identical default) when unset", () => {
    delete process.env.GRAPHIFY_LANE_BY;
    delete process.env.GRAPHIFY_SUBLANE_BY;
    expect(resolveTimeOrientedSceneOptions()).toEqual({});
  });

  it("maps GRAPHIFY_LANE_BY=repo|project → laneBy:'repo' and the sub-lane flag", () => {
    process.env.GRAPHIFY_LANE_BY = "repo";
    process.env.GRAPHIFY_SUBLANE_BY = "node_type";
    expect(resolveTimeOrientedSceneOptions()).toEqual({ laneBy: "repo", subLaneBy: "node_type" });
    process.env.GRAPHIFY_LANE_BY = "PROJECT";
    expect(resolveTimeOrientedSceneOptions().laneBy).toBe("repo");
  });

  it("applySceneLayout('time-oriented') honors GRAPHIFY_LANE_BY=repo on the export path", () => {
    process.env.GRAPHIFY_LANE_BY = "repo";
    delete process.env.GRAPHIFY_SUBLANE_BY;
    const scene = applySceneLayout(buildStudioScene(clone(PROJECT_GRAPH)), "time-oriented");
    const y = new Map(scene.nodes.map((n) => [n.id, n.y]));
    // Repo lanes (not type lanes): the two Sessions land in DIFFERENT lanes.
    expect(y.get("sess_a")).not.toBe(y.get("sess_b"));
    expect(y.get("sess_a")).toBe(y.get("repo_a"));
    expect(scene.layout_id).toBe("time-oriented");
  });
});
