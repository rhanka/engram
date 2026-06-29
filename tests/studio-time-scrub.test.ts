import { describe, expect, it } from "vitest";

// The time-scrub filter lives in the studio scene adapter and flows through the
// SAME scene → render path the weak-link filter uses (no renderer API). Root
// vitest resolves the studio JS via the configured aliases (see vitest.config.ts).
import { applyTimeFilter, sceneTimeRange } from "../studio/src/lib/graphAdapter.js";

const T0 = Date.UTC(1887, 2, 1);
const T1 = Date.UTC(1891, 4, 4);
const T2 = Date.UTC(1893, 11, 1);

/** A scene with temporal `t` (#234) on nodes + edges, plus one UNTIMED node. */
function temporalScene() {
  return {
    nodes: [
      { id: "a", t: T0 },
      { id: "b", t: T1 },
      { id: "c", t: T2 },
      { id: "u" }, // untimed (timeless scaffolding)
    ],
    edges: [
      { source: "a", target: "b", t: T1 },
      { source: "b", target: "c", t: T2 },
      { source: "a", target: "u" }, // untimed edge
    ],
    stats: { nodeCount: 4, edgeCount: 3, weakEdgeCount: 0, communityCount: 0 },
  };
}

/** A scene WITHOUT any `t` — the non-temporal baseline. */
function plainScene() {
  return {
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ source: "a", target: "b" }],
    stats: { nodeCount: 2, edgeCount: 1, weakEdgeCount: 0, communityCount: 0 },
  };
}

describe("sceneTimeRange — control visibility source", () => {
  it("returns [min, max] across timed nodes AND edges", () => {
    expect(sceneTimeRange(temporalScene())).toEqual({ min: T0, max: T2 });
  });

  it("returns null when NO element carries a `t` (control hides itself)", () => {
    expect(sceneTimeRange(plainScene())).toBeNull();
    expect(sceneTimeRange({ nodes: [], edges: [] })).toBeNull();
    expect(sceneTimeRange(null)).toBeNull();
  });
});

describe("applyTimeFilter — filter the displayed graph to t <= cursor", () => {
  it("keeps elements with t <= cursor (and untimed), drops t > cursor", () => {
    const filtered = applyTimeFilter(temporalScene(), T1);
    const ids = filtered.nodes.map((n: { id: string }) => n.id).sort();
    // a (T0) and b (T1) are <= cursor; u is untimed (kept); c (T2) is dropped.
    expect(ids).toEqual(["a", "b", "u"]);
    // Edges: a-b (T1) kept; b-c (T2) dropped (and endpoint c gone); a-u (untimed) kept.
    const edgeKeys = filtered.edges
      .map((e: { source: string; target: string }) => `${e.source}-${e.target}`)
      .sort();
    expect(edgeKeys).toEqual(["a-b", "a-u"]);
    // Stats reflect the filtered subset.
    expect(filtered.stats.nodeCount).toBe(3);
    expect(filtered.stats.edgeCount).toBe(2);
  });

  it("drops an edge whose endpoint is filtered out even if the edge is untimed", () => {
    const filtered = applyTimeFilter(temporalScene(), T0);
    const ids = filtered.nodes.map((n: { id: string }) => n.id).sort();
    expect(ids).toEqual(["a", "u"]); // only T0 + untimed survive
    // a-b drops (b gone), b-c drops, a-u survives (both endpoints present).
    expect(filtered.edges.map((e: { source: string; target: string }) => `${e.source}-${e.target}`)).toEqual([
      "a-u",
    ]);
  });

  it("a null / non-finite cursor is OFF — returns the SAME scene unchanged", () => {
    const scene = temporalScene();
    expect(applyTimeFilter(scene, null)).toBe(scene);
    expect(applyTimeFilter(scene, undefined)).toBe(scene);
    expect(applyTimeFilter(scene, Number.NaN)).toBe(scene);
  });

  it("at the max cursor every element is visible (whole graph)", () => {
    const filtered = applyTimeFilter(temporalScene(), T2);
    expect(filtered.nodes).toHaveLength(4);
    expect(filtered.edges).toHaveLength(3);
  });
});
