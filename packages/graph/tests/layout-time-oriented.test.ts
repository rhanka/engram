import { describe, expect, it } from "vitest";

import {
  AGENT_LANE_KEY,
  buildRenderGraphBuffers,
  computeTimeOrientedPositions,
  deriveRepoLaneKeys,
  getLayout,
  hasLayout,
  listLayouts,
  TIME_ORIENTED_LAYOUT_ID,
  type LayoutFn,
} from "../src/index";

/** Read back the (x, y) of node index `i` from a node-order-keyed positions array. */
function xy(positions: Float32Array, i: number): { x: number; y: number } {
  return { x: positions[i * 2]!, y: positions[i * 2 + 1]! };
}

// Epoch-ms instants, intentionally out of chronological node order so X ordering
// can't be an accident of input order.
const T0 = Date.UTC(1887, 2, 1);
const T1 = Date.UTC(1891, 4, 4);
const T2 = Date.UTC(1893, 11, 1);
const T3 = Date.UTC(1894, 3, 5);

describe("Variant E — time-oriented layout", () => {
  it("returns a valid node-order-keyed Float32Array of length 2*N", () => {
    const positions = computeTimeOrientedPositions([T0, T1, T2]);
    expect(positions).toBeInstanceOf(Float32Array);
    expect(positions.length).toBe(3 * 2);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("orders nodes by `t` on the X axis (older = smaller x, newer = larger x)", () => {
    // Node order is [T2, T0, T3, T1] — deliberately NOT chronological.
    const times = [T2, T0, T3, T1];
    const positions = computeTimeOrientedPositions(times);
    const x = times.map((_, i) => xy(positions, i).x);
    // Larger t ⇒ larger x: x of (T0) < x of (T1) < x of (T2) < x of (T3).
    const xByT = new Map(times.map((t, i) => [t, x[i]!]));
    expect(xByT.get(T0)!).toBeLessThan(xByT.get(T1)!);
    expect(xByT.get(T1)!).toBeLessThan(xByT.get(T2)!);
    expect(xByT.get(T2)!).toBeLessThan(xByT.get(T3)!);
  });

  it("normalizes the timed range into [-width/2, +width/2] (oldest left, newest right)", () => {
    const width = 1000;
    const positions = computeTimeOrientedPositions([T0, T3, T1], undefined, { width });
    // T0 is the oldest ⇒ left edge; T3 the newest ⇒ right edge.
    expect(xy(positions, 0).x).toBeCloseTo(-width / 2, 3); // T0
    expect(xy(positions, 1).x).toBeCloseTo(width / 2, 3); // T3
    // T1 sits strictly between the edges.
    expect(xy(positions, 2).x).toBeGreaterThan(-width / 2);
    expect(xy(positions, 2).x).toBeLessThan(width / 2);
  });

  it("places a single shared instant (span 0) at x = 0", () => {
    const positions = computeTimeOrientedPositions([T1, T1, T1]);
    for (let i = 0; i < 3; i++) expect(xy(positions, i).x).toBe(0);
  });

  it("parks UNTIMED nodes deterministically left of the timeline, keeping them finite", () => {
    const width = 1000;
    const untimedGap = 80;
    // index 1 + 3 are untimed (null / undefined / NaN).
    const positions = computeTimeOrientedPositions(
      [T0, null, T3, undefined, Number.NaN],
      undefined,
      { width, untimedGap },
    );
    const parkX = -width / 2 - untimedGap;
    expect(xy(positions, 1).x).toBe(parkX);
    expect(xy(positions, 3).x).toBe(parkX);
    expect(xy(positions, 4).x).toBe(parkX);
    // The parked rail is strictly left of the oldest timed node (T0 at -width/2).
    expect(parkX).toBeLessThan(xy(positions, 0).x);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("bands nodes into type LANES on Y (like Variant A) when nodeTypes is given", () => {
    const times = [T0, T1, T2, T3];
    const types = ["Character", "Location", "Character", "Evidence"];
    const positions = computeTimeOrientedPositions(times, types);
    // Same type ⇒ same y band; different type ⇒ different band.
    expect(xy(positions, 0).y).toBe(xy(positions, 2).y); // both Character
    expect(xy(positions, 0).y).not.toBe(xy(positions, 1).y); // Character vs Location
    expect(xy(positions, 3).y).not.toBe(xy(positions, 0).y); // Evidence vs Character
  });

  it("collapses to a single lane (y = 0) when no types are given", () => {
    const positions = computeTimeOrientedPositions([T0, T1, T2]);
    for (let i = 0; i < 3; i++) expect(xy(positions, i).y).toBe(0);
  });

  it("is deterministic / reproducible", () => {
    const a = computeTimeOrientedPositions([T2, T0, T3], ["A", "B", "A"]);
    const b = computeTimeOrientedPositions([T2, T0, T3], ["A", "B", "A"]);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("handles the empty graph (length 0)", () => {
    expect(computeTimeOrientedPositions([]).length).toBe(0);
  });

  it("is registered and selectable via the registry", () => {
    expect(hasLayout(TIME_ORIENTED_LAYOUT_ID)).toBe(true);
    expect(TIME_ORIENTED_LAYOUT_ID).toBe("time-oriented");
    expect(listLayouts()).toContain("time-oriented");
  });

  it("is invoked through the registry via LayoutOptions.nodeTimes (+ nodeTypes)", () => {
    const graph = buildRenderGraphBuffers({
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [],
    });
    const fn = getLayout(TIME_ORIENTED_LAYOUT_ID) as LayoutFn;
    const out = fn(graph, { nodeTimes: [T2, T0, T1], nodeTypes: ["X", "X", "X"] });
    expect(out.length).toBe(graph.nodeIds.length * 2);
    // Ordered by t on X: b (T0) < c (T1) < a (T2).
    expect(xy(out, 1).x).toBeLessThan(xy(out, 2).x);
    expect(xy(out, 2).x).toBeLessThan(xy(out, 0).x);
    // One type ⇒ one lane.
    expect(xy(out, 0).y).toBe(xy(out, 1).y);
  });
});

describe("Variant E — lanes by REPO (laneBy: 'repo') + type SUB-lanes", () => {
  // Two repos (A older lane, B newer lane); types mixed so banding can't be a type
  // accident. node order: [repoA/Session, repoA/Branch, repoB/Session, repoB/Commit].
  const times = [T0, T1, T2, T3];
  const types = ["Session", "Branch", "Session", "Commit"];
  const lanes = ["repoA", "repoA", "repoB", "repoB"];

  it("bands PRIMARILY by the owning repo, NOT by type", () => {
    const pos = computeTimeOrientedPositions(times, types, { laneBy: "repo", nodeLanes: lanes });
    // Same repo ⇒ same y lane (even though types differ); different repo ⇒ different lane.
    expect(xy(pos, 0).y).toBe(xy(pos, 1).y); // both repoA
    expect(xy(pos, 2).y).toBe(xy(pos, 3).y); // both repoB
    expect(xy(pos, 0).y).not.toBe(xy(pos, 2).y); // repoA vs repoB
  });

  it("still orders nodes by `t` on the X axis under repo lanes", () => {
    // node order [T2, T0, T3, T1] (NOT chronological) → x increases with t.
    const t = [T2, T0, T3, T1];
    const pos = computeTimeOrientedPositions(t, types, { laneBy: "repo", nodeLanes: lanes });
    const xByT = new Map(t.map((v, i) => [v, xy(pos, i).x]));
    expect(xByT.get(T0)!).toBeLessThan(xByT.get(T1)!);
    expect(xByT.get(T1)!).toBeLessThan(xByT.get(T2)!);
    expect(xByT.get(T2)!).toBeLessThan(xByT.get(T3)!);
  });

  it("honors laneOrder (top→bottom) for the repo lanes", () => {
    const pos = computeTimeOrientedPositions(times, types, {
      laneBy: "repo",
      nodeLanes: lanes,
      laneOrder: ["repoB", "repoA"], // repoB on top now
      laneGap: 100,
    });
    expect(xy(pos, 2).y).toBeLessThan(xy(pos, 0).y); // repoB lane above repoA lane
  });

  it("collapses to one lane when laneBy='repo' but nodeLanes is absent (graceful)", () => {
    const pos = computeTimeOrientedPositions(times, types, { laneBy: "repo" });
    for (let i = 1; i < 4; i++) expect(xy(pos, i).y).toBe(xy(pos, 0).y);
  });

  it("subLaneBy='node_type' splits each repo lane into closely-spaced type sub-lines", () => {
    const subTypes = ["Session", "Branch", "Session", "Branch"];
    const pos = computeTimeOrientedPositions(times, subTypes, {
      laneBy: "repo",
      nodeLanes: lanes,
      laneGap: 120,
      subLaneBy: "node_type",
    });
    const y0 = xy(pos, 0).y; // repoA / Session
    const y1 = xy(pos, 1).y; // repoA / Branch
    const y2 = xy(pos, 2).y; // repoB / Session
    const y3 = xy(pos, 3).y; // repoB / Branch
    // Within a repo lane, the two types now sit on DIFFERENT sub-lines.
    expect(y0).not.toBe(y1);
    // The SAME type keeps the SAME sub-offset across lanes (global sub-order):
    // Session→Session and Branch→Branch differ only by the lane gap.
    expect(y1 - y0).toBeCloseTo(y3 - y2, 6);
    // Sub-lane separation is strictly TIGHTER than the primary lane separation.
    expect(Math.abs(y1 - y0)).toBeLessThan(Math.abs(y2 - y0));
  });

  it("is deterministic under repo lanes + sub-lanes", () => {
    const opts = { laneBy: "repo" as const, nodeLanes: lanes, subLaneBy: "node_type" as const };
    const a = computeTimeOrientedPositions(times, types, opts);
    const b = computeTimeOrientedPositions(times, types, opts);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe("deriveRepoLaneKeys — repo membership from graph topology", () => {
  // A mini agent-stats project graph: one Project, two Repos (rename lineage),
  // one Agent, two Sessions, a Branch SHARED across both repos, one Commit.
  const nodes = [
    { id: "project_p", type: "Project" },
    { id: "repo_a", type: "Repo" },
    { id: "repo_b", type: "Repo" },
    { id: "agent_x", type: "Agent" },
    { id: "sess_1", type: "Session" },
    { id: "sess_2", type: "Session" },
    { id: "branch_shared", type: "Branch" },
    { id: "commit_1", type: "Commit" },
  ];
  const edges = [
    { source: "repo_a", target: "project_p" }, // belongs-to
    { source: "repo_b", target: "project_p" },
    { source: "repo_a", target: "repo_b" }, // rename-lineage
    { source: "sess_1", target: "repo_a" }, // worked-in
    { source: "sess_2", target: "repo_b" },
    { source: "sess_1", target: "agent_x" }, // conducted-by (hub — excluded)
    { source: "sess_2", target: "agent_x" },
    { source: "sess_1", target: "branch_shared" }, // touched-branch
    { source: "sess_2", target: "branch_shared" }, // shared across both repos
    { source: "sess_1", target: "commit_1" }, // produced
  ];

  it("keys Repo/Project nodes to their own lane and groups Agents into AGENT_LANE_KEY", () => {
    const { laneKeys } = deriveRepoLaneKeys(nodes, edges);
    const byId = new Map(nodes.map((nd, i) => [nd.id, laneKeys[i]]));
    expect(byId.get("repo_a")).toBe("repo_a");
    expect(byId.get("repo_b")).toBe("repo_b");
    expect(byId.get("project_p")).toBe("project_p");
    expect(byId.get("agent_x")).toBe(AGENT_LANE_KEY);
  });

  it("inherits each Session's repo (worked-in) and its Commit's repo (produced)", () => {
    const { laneKeys } = deriveRepoLaneKeys(nodes, edges);
    const byId = new Map(nodes.map((nd, i) => [nd.id, laneKeys[i]]));
    expect(byId.get("sess_1")).toBe("repo_a");
    expect(byId.get("sess_2")).toBe("repo_b");
    expect(byId.get("commit_1")).toBe("repo_a"); // produced by sess_1
  });

  it("resolves a SHARED branch deterministically to the earliest repo (tie-break)", () => {
    const { laneKeys } = deriveRepoLaneKeys(nodes, edges);
    const byId = new Map(nodes.map((nd, i) => [nd.id, laneKeys[i]]));
    // branch touched by both sessions → claimed by repo_a (seeded first);
    // sess_2 (repo_b) → branch_shared then reads as a cross-lane (inter-repo) link.
    expect(byId.get("branch_shared")).toBe("repo_a");
  });

  it("does NOT leak a repo across the shared Project/Agent hubs", () => {
    // If the hubs were traversable, sess_2's repo could bleed into repo_a's nodes.
    const { laneKeys } = deriveRepoLaneKeys(nodes, edges);
    const byId = new Map(nodes.map((nd, i) => [nd.id, laneKeys[i]]));
    expect(byId.get("sess_2")).toBe("repo_b"); // stayed in its own repo
  });

  it("suggests a stable laneOrder: repos (graph order) → projects → agents", () => {
    const { laneOrder } = deriveRepoLaneKeys(nodes, edges);
    expect(laneOrder).toEqual(["repo_a", "repo_b", "project_p", AGENT_LANE_KEY]);
  });

  it("feeds straight into computeTimeOrientedPositions as nodeLanes (repo lanes)", () => {
    const { laneKeys, laneOrder } = deriveRepoLaneKeys(nodes, edges);
    const nodeTimes = nodes.map((_, i) => T0 + i * 1000);
    const nodeTypes = nodes.map((nd) => nd.type);
    const pos = computeTimeOrientedPositions(nodeTimes, nodeTypes, {
      laneBy: "repo",
      nodeLanes: laneKeys,
      laneOrder,
    });
    const yById = new Map(nodes.map((nd, i) => [nd.id, xy(pos, i).y]));
    // sess_1, branch_shared, commit_1 all in the repo_a lane (loops stay local).
    expect(yById.get("sess_1")).toBe(yById.get("repo_a"));
    expect(yById.get("branch_shared")).toBe(yById.get("repo_a"));
    expect(yById.get("commit_1")).toBe(yById.get("repo_a"));
    // sess_2 in the repo_b lane → its branch_shared edge spans lanes (inter-repo).
    expect(yById.get("sess_2")).toBe(yById.get("repo_b"));
    expect(yById.get("sess_2")).not.toBe(yById.get("branch_shared"));
  });

  it("handles the empty graph", () => {
    const { laneKeys, laneOrder } = deriveRepoLaneKeys([], []);
    expect(laneKeys).toEqual([]);
    expect(laneOrder).toEqual([]);
  });
});
