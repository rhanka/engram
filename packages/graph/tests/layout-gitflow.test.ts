/**
 * GIT-FLOW layout — unit gate.
 *
 * Pins the layout contract on a synthetic repo (deterministic, pure):
 *  • trunk (main) first-parent chain on lane 0, oldest LEFT → newest RIGHT;
 *  • LANE-REUSE interval colouring: overlapping branch intervals get DISTINCT
 *    lanes; a freed lane is REUSED (gitk-style) — ALL branches placed, no top-K;
 *  • port/direction invariant: every placed commit-parent edge is hinted
 *    flow-port-reverse and its PARENT sits left of its CHILD;
 *  • display window: enclose kept forks (+2 margin), cap at maxWindow; older
 *    trunk parks (placed=0); pre-window forks attach WINDOW-LEFT with a
 *    dashed entry;
 *  • sessions sub-position under their produced commit (else the touched
 *    branch's tip); branch labels anchor at the lane start.
 */

import { describe, expect, it } from "vitest";
import {
  computeGitFlowPositions,
  gitFlowLayout,
  type GitFlowEdgeInput,
  type GitFlowNodeInput,
} from "../src/layout-gitflow";
import { GIT_FLOW_LAYOUT_ID, getLayout, hasLayout } from "../src/layout-registry";

// ---------------------------------------------------------------------------
// Synthetic repo builder (the #257 model: commit-parent child→parent,
// branch-head branch→tip, produced session→commit, touched-branch session→branch).
// ---------------------------------------------------------------------------

interface Repo {
  nodes: GitFlowNodeInput[];
  edges: GitFlowEdgeInput[];
  index: Map<string, number>;
  edgeIndex: Map<string, number>; // "source→target" → edge index
}

function makeRepo(): Repo {
  const nodes: GitFlowNodeInput[] = [];
  const edges: GitFlowEdgeInput[] = [];
  const index = new Map<string, number>();
  const edgeIndex = new Map<string, number>();
  const addNode = (node: GitFlowNodeInput): void => {
    index.set(node.id, nodes.length);
    nodes.push(node);
  };
  const addEdge = (edge: GitFlowEdgeInput): void => {
    edgeIndex.set(`${edge.source}→${edge.target}`, edges.length);
    edges.push(edge);
  };
  const repo = "r";

  // Trunk: c0 (oldest) … c9 (tip), chained child→parent.
  for (let i = 0; i < 10; i += 1) addNode({ id: `c${i}`, type: "Commit", repo });
  for (let i = 1; i < 10; i += 1)
    addEdge({ source: `c${i}`, target: `c${i - 1}`, relation: "commit-parent" });

  // feature-a: forks at c2, three commits a1→a2→a3 (interval [2,5]).
  // feature-b: forks at c3, two commits (interval [3,5]) — OVERLAPS feature-a.
  // feature-c: forks at c7, two commits (interval [7,9]) — starts AFTER both
  //            intervals end (+gap) ⇒ must REUSE feature-a's freed lane.
  const chain = (name: string, fork: string, ids: string[]): void => {
    ids.forEach((id, i) => {
      addNode({ id, type: "Commit", repo });
      addEdge({ source: id, target: i === 0 ? fork : ids[i - 1]!, relation: "commit-parent" });
    });
    addNode({ id: `branch-${name}`, type: "Branch", repo, name });
    addEdge({ source: `branch-${name}`, target: ids[ids.length - 1]!, relation: "branch-head" });
  };
  chain("feature-a", "c2", ["a1", "a2", "a3"]);
  chain("feature-b", "c3", ["b1", "b2"]);
  chain("feature-c", "c7", ["d1", "d2"]);

  addNode({ id: "branch-main", type: "Branch", repo, name: "main" });
  addEdge({ source: "branch-main", target: "c9", relation: "branch-head" });

  // Sessions: two on a2 (stacked), one attached to feature-b's tip only.
  addNode({ id: "s1", type: "Session", repo });
  addNode({ id: "s2", type: "Session", repo });
  addNode({ id: "s3", type: "Session", repo });
  addEdge({ source: "s1", target: "a2", relation: "produced" });
  addEdge({ source: "s2", target: "a2", relation: "produced" });
  addEdge({ source: "s3", target: "branch-feature-b", relation: "touched-branch" });

  return { nodes, edges, index, edgeIndex };
}

const OPTS = { rankGap: 60, laneGap: 44, sessionGap: 16 };

function xOf(repo: Repo, positions: Float32Array, id: string): number {
  return positions[repo.index.get(id)! * 2]!;
}
function yOf(repo: Repo, positions: Float32Array, id: string): number {
  return positions[repo.index.get(id)! * 2 + 1]!;
}

describe("computeGitFlowPositions — trunk + lanes", () => {
  const repo = makeRepo();
  const layout = computeGitFlowPositions(repo, OPTS);
  const { positions } = layout;

  it("trunk first-parent chain sits on lane 0, oldest left → newest right", () => {
    for (let i = 0; i < 10; i += 1) {
      expect(yOf(repo, positions, `c${i}`)).toBe(0); // lane 0
      expect(xOf(repo, positions, `c${i}`)).toBe(i * 60); // rank · rankGap
      expect(layout.placed[repo.index.get(`c${i}`)!]).toBe(1);
    }
  });

  it("overlapping branch intervals occupy DISTINCT lanes", () => {
    const laneA = yOf(repo, positions, "a1");
    const laneB = yOf(repo, positions, "b1");
    expect(laneA).not.toBe(0);
    expect(laneB).not.toBe(0);
    expect(laneA).not.toBe(laneB); // [2,5] and [3,5] overlap ⇒ distinct lanes
  });

  it("a freed lane is REUSED once the previous interval ends (+gap)", () => {
    // feature-c forks at rank 7; feature-a's interval [2,5] freed at 5+1 < 7.
    expect(yOf(repo, positions, "d1")).toBe(yOf(repo, positions, "a1"));
    expect(layout.laneCounts.get("r")).toBe(3); // trunk + 2 lanes for 3 branches
  });

  it("branch commits rank from their fork: fork commit LEFT of first branch commit", () => {
    expect(xOf(repo, positions, "a1")).toBeGreaterThan(xOf(repo, positions, "c2"));
    expect(xOf(repo, positions, "a1")).toBe(3 * 60); // forkRank 2 + 1
    expect(xOf(repo, positions, "a3")).toBe(5 * 60);
    expect(xOf(repo, positions, "b1")).toBe(4 * 60); // forkRank 3 + 1
    expect(xOf(repo, positions, "d1")).toBe(8 * 60); // forkRank 7 + 1
  });

  it("EVERY commit-parent hint between placed commits is flow-port-reverse with parent LEFT of child", () => {
    repo.edges.forEach((edge, e) => {
      if (edge.relation !== "commit-parent") return;
      const hint = layout.edgeHints[e]!;
      expect(hint.style).toBe("flow-port-reverse");
      expect(hint.dash).toBe("solid");
      // child (source) is NEWER ⇒ drawn to the RIGHT of its parent (target).
      expect(xOf(repo, positions, edge.source)).toBeGreaterThan(xOf(repo, positions, edge.target));
    });
  });

  it("branch-head / touched-branch edges are hidden; produced is a session-link", () => {
    expect(layout.edgeHints[repo.edgeIndex.get("branch-feature-a→a3")!]!.style).toBe("hidden");
    expect(layout.edgeHints[repo.edgeIndex.get("s3→branch-feature-b")!]!.style).toBe("hidden");
    expect(layout.edgeHints[repo.edgeIndex.get("s1→a2")!]!.style).toBe("session-link");
  });

  it("branch labels anchor at the LANE START: left of the first commit, floated just above the lane", () => {
    const labelA = layout.branchLabels.find((l) => l.name === "feature-a")!;
    expect(labelA.x).toBeLessThan(xOf(repo, positions, "a1"));
    // Floated ABOVE its lane line (so a label glyph never covers the entry S
    // or the first commit's left port), but well within the lane's half-gap.
    expect(labelA.y).toBeLessThan(yOf(repo, positions, "a1"));
    expect(labelA.y).toBeGreaterThan(yOf(repo, positions, "a1") - OPTS.laneGap / 2);
    expect(labelA.entry).toBe("in-window");
    const labelMain = layout.branchLabels.find((l) => l.name === "main")!;
    expect(labelMain.lane).toBe(0);
    expect(labelMain.x).toBeLessThan(xOf(repo, positions, "c0"));
  });

  it("sessions stack UNDER the commit they produced; tip-anchored otherwise", () => {
    expect(xOf(repo, positions, "s1")).toBe(xOf(repo, positions, "a2"));
    expect(yOf(repo, positions, "s1")).toBeGreaterThan(yOf(repo, positions, "a2"));
    expect(xOf(repo, positions, "s2")).toBe(xOf(repo, positions, "a2"));
    expect(yOf(repo, positions, "s2")).toBeGreaterThan(yOf(repo, positions, "s1")); // stacked
    // s3 has no produced commit: near feature-b's TIP.
    expect(xOf(repo, positions, "s3")).toBe(xOf(repo, positions, "b2"));
    expect(yOf(repo, positions, "s3")).toBeGreaterThan(yOf(repo, positions, "b2"));
  });

  it("is deterministic (two runs are float-identical)", () => {
    const again = computeGitFlowPositions(repo, OPTS);
    expect(Array.from(again.positions)).toEqual(Array.from(positions));
  });
});

// ---------------------------------------------------------------------------
// Display window: enclose kept forks, cap at maxWindow, window-left attaches.
// ---------------------------------------------------------------------------

function longTrunkRepo(trunkLen: number, forks: Array<{ name: string; at: number; len: number }>): Repo {
  const nodes: GitFlowNodeInput[] = [];
  const edges: GitFlowEdgeInput[] = [];
  const index = new Map<string, number>();
  const edgeIndex = new Map<string, number>();
  const addNode = (node: GitFlowNodeInput): void => {
    index.set(node.id, nodes.length);
    nodes.push(node);
  };
  const addEdge = (edge: GitFlowEdgeInput): void => {
    edgeIndex.set(`${edge.source}→${edge.target}`, edges.length);
    edges.push(edge);
  };
  for (let i = 0; i < trunkLen; i += 1) {
    addNode({ id: `c${i}`, type: "Commit", repo: "r" });
    if (i > 0) addEdge({ source: `c${i}`, target: `c${i - 1}`, relation: "commit-parent" });
  }
  addNode({ id: "branch-main", type: "Branch", repo: "r", name: "main" });
  addEdge({ source: "branch-main", target: `c${trunkLen - 1}`, relation: "branch-head" });
  for (const fork of forks) {
    const ids = Array.from({ length: fork.len }, (_, k) => `${fork.name}-${k}`);
    ids.forEach((id, k) => {
      addNode({ id, type: "Commit", repo: "r" });
      addEdge({
        source: id,
        target: k === 0 ? `c${fork.at}` : ids[k - 1]!,
        relation: "commit-parent",
      });
    });
    addNode({ id: `branch-${fork.name}`, type: "Branch", repo: "r", name: fork.name });
    addEdge({ source: `branch-${fork.name}`, target: ids[ids.length - 1]!, relation: "branch-head" });
  }
  return { nodes, edges, index, edgeIndex };
}

describe("computeGitFlowPositions — display window", () => {
  it("window encloses the kept forks with a 2-rank margin when uncapped", () => {
    const repo = longTrunkRepo(100, [{ name: "f", at: 50, len: 2 }]);
    const layout = computeGitFlowPositions(repo, OPTS);
    expect(layout.windowStarts.get("r")).toBe(48); // fork 50 − 2 margin
    // Leftmost displayed trunk commit is rank 48 at x = 0; older trunk parks.
    expect(xOf(repo, layout.positions, "c48")).toBe(0);
    expect(layout.placed[repo.index.get("c47")!]).toBe(0);
    expect(xOf(repo, layout.positions, "c47")).toBe(-60); // park column
  });

  it("caps the window at maxWindow ranks; a pre-window fork attaches WINDOW-LEFT dashed", () => {
    const repo = longTrunkRepo(600, [
      { name: "old", at: 10, len: 3 },
      { name: "recent", at: 590, len: 2 },
    ]);
    const layout = computeGitFlowPositions(repo, { ...OPTS, maxWindow: 400 });
    expect(layout.windowStarts.get("r")).toBe(200); // tipRank 599 − 400 + 1

    // The OLD branch attaches at the window's left edge…
    const oldLabel = layout.branchLabels.find((l) => l.name === "old")!;
    expect(oldLabel.entry).toBe("window-left");
    expect(xOf(repo, layout.positions, "old-0")).toBe(0); // re-anchored at the edge
    expect(layout.placed[repo.index.get("old-0")!]).toBe(1); // still PLACED — no top-K
    // …with a DASHED soft entry (its fork commit c10 is parked pre-window).
    const entry = layout.edgeHints[repo.edgeIndex.get("old-0→c10")!]!;
    expect(entry.style).toBe("flow-port-reverse");
    expect(entry.dash).toBe("dashed");

    // The RECENT branch stays a normal in-window fork.
    const recentLabel = layout.branchLabels.find((l) => l.name === "recent")!;
    expect(recentLabel.entry).toBe("in-window");
    expect(layout.edgeHints[repo.edgeIndex.get("recent-0→c590")!]!.dash).toBe("solid");

    // Pre-window trunk parks; in-window trunk stays placed.
    expect(layout.placed[repo.index.get("c100")!]).toBe(0);
    expect(layout.placed[repo.index.get("c599")!]).toBe(1);
    expect(xOf(repo, layout.positions, "c599")).toBe((599 - 200) * 60);
  });
});

// ---------------------------------------------------------------------------
// Scale: hundreds of branches, all placed, lanes stay compact via reuse.
// ---------------------------------------------------------------------------

describe("computeGitFlowPositions — lane reuse at scale (ALL branches, no top-K)", () => {
  it("places 200 branches and reuses lanes so the band stays compact", () => {
    // 200 branches, forks marching right 2 ranks apart, each 3 commits long
    // (interval span 4). At any rank ≲ 3 intervals overlap ⇒ lanes ≈ 3-4,
    // NOT 200. Every branch must be placed.
    const forks = Array.from({ length: 200 }, (_, k) => ({
      name: `b${String(k).padStart(3, "0")}`,
      at: 2 * k,
      len: 3,
    }));
    const repo = longTrunkRepo(420, forks);
    const layout = computeGitFlowPositions(repo, { ...OPTS, maxWindow: 1000 });

    expect(layout.branchLabels.filter((l) => l.entry !== "tip-only")).toHaveLength(201); // 200 + main
    for (const fork of forks) {
      expect(layout.placed[repo.index.get(`${fork.name}-0`)!]).toBe(1);
    }
    const lanes = layout.laneCounts.get("r")!;
    expect(lanes).toBeGreaterThanOrEqual(3);
    expect(lanes).toBeLessThanOrEqual(6); // interval colouring keeps it compact
  });
});

// ---------------------------------------------------------------------------
// Registry integration.
// ---------------------------------------------------------------------------

describe("git-flow layout registration", () => {
  it("is registered under 'git-flow' and adapts RenderGraphBuffers + LayoutOptions", () => {
    expect(hasLayout(GIT_FLOW_LAYOUT_ID)).toBe(true);
    expect(getLayout(GIT_FLOW_LAYOUT_ID)).toBe(gitFlowLayout);

    const repo = makeRepo();
    const nodeIds = repo.nodes.map((n) => n.id);
    const edgePairs = new Uint32Array(repo.edges.length * 2);
    repo.edges.forEach((edge, e) => {
      edgePairs[e * 2] = repo.index.get(edge.source)!;
      edgePairs[e * 2 + 1] = repo.index.get(edge.target)!;
    });
    const graph = {
      nodeIds,
      idToIndex: repo.index,
      positions: new Float32Array(nodeIds.length * 2),
      edges: edgePairs,
      droppedEdges: 0,
    };
    const viaRegistry = gitFlowLayout(graph, {
      nodeTypes: repo.nodes.map((n) => n.type),
      nodeLanes: repo.nodes.map((n) => n.repo),
      nodeNames: repo.nodes.map((n) => n.name),
      edgeRelations: repo.edges.map((e) => e.relation),
    });
    const direct = computeGitFlowPositions(repo); // default options
    expect(viaRegistry).toHaveLength(nodeIds.length * 2);
    expect(Array.from(viaRegistry)).toEqual(Array.from(direct.positions));
  });
});
