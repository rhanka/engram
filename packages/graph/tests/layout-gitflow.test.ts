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

  it("ARROW GRAMMAR: fork descents are BARE (arrow false); lane segments keep the arrow", () => {
    // Fork entries (fork commit → first exclusive branch commit): no arrowhead
    // — a descending arrow reads as an inverted merge (principal's UAT).
    for (const forkEdge of ["a1→c2", "b1→c3", "d1→c7"]) {
      const hint = layout.edgeHints[repo.edgeIndex.get(forkEdge)!]!;
      expect(hint.style, forkEdge).toBe("flow-port-reverse");
      expect(hint.arrow, forkEdge).toBe(false);
    }
    // Lane segments (trunk + within-branch) stay arrowed.
    for (const laneEdge of ["c5→c4", "a2→a1", "b2→b1", "d2→d1"]) {
      expect(layout.edgeHints[repo.edgeIndex.get(laneEdge)!]!.arrow, laneEdge).toBe(true);
    }
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
    // …with a DASHED soft entry (its fork commit c10 is parked pre-window),
    // BARE like every fork descent (only merges / lane segments arrow).
    const entry = layout.edgeHints[repo.edgeIndex.get("old-0→c10")!]!;
    expect(entry.style).toBe("flow-port-reverse");
    expect(entry.dash).toBe("dashed");
    expect(entry.arrow).toBe(false);

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
// merged-as: arrowed ascending merge connectors + lane freed AT the merge rank.
// ---------------------------------------------------------------------------

describe("computeGitFlowPositions — merged-as (merge-back connectors)", () => {
  // Branch A forks at rank 2 (2 commits, tip rank 4); branch B forks at 6.
  // WITHOUT a merge, A's interval [2,4] frees before 6 ⇒ B reuses A's lane.
  // WITH `merged-as` A-1 → c8 the interval extends to the merge rank 8 ⇒ B
  // must open a NEW lane, and the lane only frees AFTER rank 8.
  const build = (withMerge: boolean): Repo => {
    const repo = longTrunkRepo(12, [
      { name: "aaa", at: 2, len: 2 },
      { name: "bbb", at: 6, len: 2 },
    ]);
    if (withMerge) {
      repo.edgeIndex.set("aaa-1→c8", repo.edges.length);
      repo.edges.push({ source: "aaa-1", target: "c8", relation: "merged-as" });
    }
    return repo;
  };

  it("emits an ARROWED flow-port hint for the merge connector (tip LEFT of merge commit)", () => {
    const repo = build(true);
    const layout = computeGitFlowPositions(repo, OPTS);
    const hint = layout.edgeHints[repo.edgeIndex.get("aaa-1→c8")!]!;
    expect(hint.style).toBe("flow-port"); // drawn AS-IS: tip → merge, ascending
    expect(hint.arrow).toBe(true); // the ONE arrowed connector of the grammar
    // Direction invariant: the tip is LEFT of the merge commit (old → new).
    expect(xOf(repo, layout.positions, "aaa-1")).toBeLessThan(xOf(repo, layout.positions, "c8"));
  });

  it("the merged branch's lane stays reserved up to the merge rank, then frees", () => {
    // Control: no merge ⇒ interval [2,4] frees at 4+1 < 6 ⇒ bbb REUSES the lane.
    const control = computeGitFlowPositions(build(false), OPTS);
    const controlRepo = build(false);
    expect(yOf(controlRepo, control.positions, "bbb-0")).toBe(
      yOf(controlRepo, control.positions, "aaa-0"),
    );
    expect(control.laneCounts.get("r")).toBe(2); // trunk + 1 shared lane

    // Merged: interval extends to the merge rank 8 ⇒ bbb (fork 6) CANNOT reuse.
    const repo = build(true);
    const merged = computeGitFlowPositions(repo, OPTS);
    expect(yOf(repo, merged.positions, "bbb-0")).not.toBe(yOf(repo, merged.positions, "aaa-0"));
    expect(merged.laneCounts.get("r")).toBe(3); // trunk + 2 lanes while A is open to rank 8
  });

  it("a merge into an UNPLACED commit degrades to hidden (never a dangling arrow)", () => {
    const repo = longTrunkRepo(12, [{ name: "aaa", at: 2, len: 2 }]);
    repo.edgeIndex.set("aaa-1→ghost", repo.edges.length);
    repo.edges.push({ source: "aaa-1", target: "ghost", relation: "merged-as" });
    const layout = computeGitFlowPositions(repo, OPTS);
    expect(layout.edgeHints[repo.edgeIndex.get("aaa-1→ghost")!]!.style).toBe("hidden");
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

// ---------------------------------------------------------------------------
// xMode — SEQUENCE (rank, default) vs TIME (x ∝ commit committer-date `t`).
// ---------------------------------------------------------------------------

/**
 * Timed fixture (rankGap 60 ⇒ epsilon = 6):
 *   trunk  c0(t=0) → c1(t=100) → c2(UNDATED) → c3(t=300) → c4(t=1000, tip)
 *   feat-t: forks at c1 — f1(t=500) → f2(t=500)   (same instant)
 *   feat-u: forks at c3 — u1, u2 both UNDATED     (whole lane undated)
 * Rank-mode ranks: trunk 0…4 (x 0…240), f1/f2 ranks 2/3, u1/u2 ranks 4/5
 * (x 240/300) ⇒ rank width = 300 (u2) = the time-axis width.
 */
function makeTimedRepo(): Repo {
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
  const trunkT: (number | null)[] = [0, 100, null, 300, 1000];
  trunkT.forEach((t, i) => addNode({ id: `c${i}`, type: "Commit", repo, t }));
  for (let i = 1; i < trunkT.length; i += 1)
    addEdge({ source: `c${i}`, target: `c${i - 1}`, relation: "commit-parent" });
  addNode({ id: "branch-main", type: "Branch", repo, name: "main" });
  addEdge({ source: "branch-main", target: "c4", relation: "branch-head" });

  addNode({ id: "f1", type: "Commit", repo, t: 500 });
  addNode({ id: "f2", type: "Commit", repo, t: 500 });
  addEdge({ source: "f1", target: "c1", relation: "commit-parent" });
  addEdge({ source: "f2", target: "f1", relation: "commit-parent" });
  addNode({ id: "branch-feat-t", type: "Branch", repo, name: "feat-t" });
  addEdge({ source: "branch-feat-t", target: "f2", relation: "branch-head" });

  addNode({ id: "u1", type: "Commit", repo });
  addNode({ id: "u2", type: "Commit", repo });
  addEdge({ source: "u1", target: "c3", relation: "commit-parent" });
  addEdge({ source: "u2", target: "u1", relation: "commit-parent" });
  addNode({ id: "branch-feat-u", type: "Branch", repo, name: "feat-u" });
  addEdge({ source: "branch-feat-u", target: "u2", relation: "branch-head" });

  addNode({ id: "st", type: "Session", repo });
  addEdge({ source: "st", target: "f1", relation: "produced" });
  return { nodes, edges, index, edgeIndex };
}

const EPSILON = OPTS.rankGap * 0.1; // TIME_EPSILON_FRACTION pinned by contract

describe("computeGitFlowPositions — xMode (SEQUENCE vs TIME)", () => {
  it("REGRESSION PIN: default output is byte-identical to explicit xMode:'rank', even with t present", () => {
    const timed = makeTimedRepo();
    const byDefault = computeGitFlowPositions(timed, OPTS);
    const byRank = computeGitFlowPositions(timed, { ...OPTS, xMode: "rank" });
    expect(Array.from(byDefault.positions)).toEqual(Array.from(byRank.positions));
    expect(byDefault.edgeHints).toEqual(byRank.edgeHints);
    expect(byDefault.branchLabels).toEqual(byRank.branchLabels);
    // …and t is IGNORED by the default mode: same x whether t is present or not.
    const untimed = makeTimedRepo();
    for (const n of untimed.nodes) delete n.t;
    const noT = computeGitFlowPositions(untimed, OPTS);
    expect(Array.from(noT.positions)).toEqual(Array.from(byDefault.positions)); // rank x = pure topology
  });

  it("TIME: dated commits sit ∝ t on ONE axis scaled to the rank-mode width", () => {
    const repo = makeTimedRepo();
    const { positions } = computeGitFlowPositions(repo, { ...OPTS, xMode: "time" });
    // Rank width = 300 (u2 at rank 5); span = 1000 ⇒ x = t * 0.3.
    expect(xOf(repo, positions, "c0")).toBeCloseTo(0, 3);
    expect(xOf(repo, positions, "c1")).toBeCloseTo(30, 3);
    expect(xOf(repo, positions, "c3")).toBeCloseTo(90, 3);
    expect(xOf(repo, positions, "c4")).toBeCloseTo(300, 3);
    expect(xOf(repo, positions, "f1")).toBeCloseTo(150, 3); // t=500
    // Ordering by t regardless of topological rank spacing.
    expect(xOf(repo, positions, "c1")).toBeGreaterThan(xOf(repo, positions, "c0"));
    expect(xOf(repo, positions, "c4")).toBeGreaterThan(xOf(repo, positions, "f2"));
  });

  it("TIME: same-instant commits on a lane spread by the epsilon min-spacing", () => {
    const repo = makeTimedRepo();
    const { positions } = computeGitFlowPositions(repo, { ...OPTS, xMode: "time" });
    const f1 = xOf(repo, positions, "f1");
    const f2 = xOf(repo, positions, "f2");
    expect(f2).toBeCloseTo(f1 + EPSILON, 3); // t identical ⇒ epsilon apart
    expect(f2).toBeGreaterThan(f1); // never collapse
  });

  it("TIME: an UNDATED commit interpolates between its nearest dated lane neighbours", () => {
    const repo = makeTimedRepo();
    const { positions } = computeGitFlowPositions(repo, { ...OPTS, xMode: "time" });
    // c2 (undated) sits halfway between c1 (x=30) and c3 (x=90).
    expect(xOf(repo, positions, "c2")).toBeCloseTo(60, 3);
  });

  it("TIME: a fully UNDATED lane parks at its lane start (fork anchor) + epsilon steps", () => {
    const repo = makeTimedRepo();
    const { positions } = computeGitFlowPositions(repo, { ...OPTS, xMode: "time" });
    const fork = xOf(repo, positions, "c3"); // 90
    expect(xOf(repo, positions, "u1")).toBeCloseTo(fork + EPSILON, 3);
    expect(xOf(repo, positions, "u2")).toBeCloseTo(fork + 2 * EPSILON, 3);
  });

  it("TIME: sessions keep anchoring under their produced commit; labels re-anchor to the moved lane", () => {
    const repo = makeTimedRepo();
    const layout = computeGitFlowPositions(repo, { ...OPTS, xMode: "time" });
    const { positions } = layout;
    expect(xOf(repo, positions, "st")).toBeCloseTo(xOf(repo, positions, "f1"), 3);
    expect(yOf(repo, positions, "st")).toBeGreaterThan(yOf(repo, positions, "f1")); // still BELOW
    const label = layout.branchLabels.find((l) => l.name === "feat-t")!;
    expect(label.x).toBeCloseTo(xOf(repo, positions, "f1") - 0.6 * OPTS.rankGap, 3); // LABEL_RANK_INSET
    expect(label.tipX).toBeCloseTo(xOf(repo, positions, "f2"), 3);
    // Branch label Y / lane assignment logic untouched by the x remap.
    const rank = computeGitFlowPositions(makeTimedRepo(), OPTS);
    expect(label.y).toBeCloseTo(rank.branchLabels.find((l) => l.name === "feat-t")!.y, 6);
    expect(label.lane).toBe(rank.branchLabels.find((l) => l.name === "feat-t")!.lane);
  });

  it("TIME: one GLOBAL axis across repo bands — equal t ⇒ equal x in different repos", () => {
    const nodes: GitFlowNodeInput[] = [
      { id: "ra0", type: "Commit", repo: "A", t: 0 },
      { id: "ra1", type: "Commit", repo: "A", t: 1000 },
      { id: "rb0", type: "Commit", repo: "B", t: 500 },
      { id: "rb1", type: "Commit", repo: "B", t: 1000 },
    ];
    const edges: GitFlowEdgeInput[] = [
      { source: "ra1", target: "ra0", relation: "commit-parent" },
      { source: "rb1", target: "rb0", relation: "commit-parent" },
    ];
    const layout = computeGitFlowPositions({ nodes, edges }, { ...OPTS, xMode: "time" });
    const x = (i: number): number => layout.positions[i * 2]!;
    expect(x(1)).toBeCloseTo(x(3), 3); // t=1000 aligns across bands
    expect(x(2)).toBeCloseTo(x(1) / 2, 3); // t=500 = mid-axis
  });

  it("TIME: with NO dated commit anywhere, falls back to the rank x wholesale", () => {
    const repo = makeTimedRepo();
    for (const n of repo.nodes) delete n.t;
    const time = computeGitFlowPositions(repo, { ...OPTS, xMode: "time" });
    const rank = computeGitFlowPositions(repo, OPTS);
    expect(Array.from(time.positions)).toEqual(Array.from(rank.positions));
  });

  it("registry adapter forwards LayoutOptions.xMode to the git-flow layout", () => {
    const repo = makeTimedRepo();
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
    const layoutOptions = {
      nodeTypes: repo.nodes.map((n) => n.type),
      nodeLanes: repo.nodes.map((n) => n.repo),
      nodeNames: repo.nodes.map((n) => n.name),
      nodeTimes: repo.nodes.map((n) => n.t),
      edgeRelations: repo.edges.map((e) => e.relation),
    };
    const viaTime = gitFlowLayout(graph, { ...layoutOptions, xMode: "time" });
    const direct = computeGitFlowPositions(repo, { xMode: "time" }); // default gaps
    expect(Array.from(viaTime)).toEqual(Array.from(direct.positions));
    const viaDefault = gitFlowLayout(graph, layoutOptions);
    expect(Array.from(viaDefault)).toEqual(
      Array.from(computeGitFlowPositions(repo).positions), // rank remains the default
    );
  });
});
