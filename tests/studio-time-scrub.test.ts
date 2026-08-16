import { describe, expect, it } from "vitest";

// The time-scrub filter lives in the studio scene adapter and flows through the
// SAME scene → render path the weak-link filter uses (no renderer API). Root
// vitest resolves the studio JS via the configured aliases (see vitest.config.ts).
import { applyTimeFilter, sceneTimeRange } from "../studio/src/lib/graphAdapter.js";

const T0 = Date.UTC(1887, 2, 1);
const T1 = Date.UTC(1891, 4, 4);
const T2 = Date.UTC(1893, 11, 1);

/** A scene with closed temporal spans on nodes + edges, plus one untimed node. */
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

describe("applyTimeFilter — closed temporal interval membership", () => {
  it("keeps elements whose closed interval contains the cursor and drops untimed elements", () => {
    const filtered = applyTimeFilter(temporalScene(), T1);
    const ids = filtered.nodes.map((n: { id: string }) => n.id).sort();
    // a (T0) and b (T1) contain the cursor; untimed u and future c are dropped.
    expect(ids).toEqual(["a", "b"]);
    // a-b contains the cursor; b-c is future and a-u is untimed.
    const edgeKeys = filtered.edges
      .map((e: { source: string; target: string }) => `${e.source}-${e.target}`)
      .sort();
    expect(edgeKeys).toEqual(["a-b"]);
    // Stats reflect the filtered subset.
    expect(filtered.stats.nodeCount).toBe(2);
    expect(filtered.stats.edgeCount).toBe(1);
  });

  it("drops an untimed edge even when both endpoints would otherwise be visible", () => {
    const filtered = applyTimeFilter(temporalScene(), T0);
    const ids = filtered.nodes.map((n: { id: string }) => n.id).sort();
    expect(ids).toEqual(["a"]); // only T0 contains the cursor
    expect(filtered.edges).toEqual([]);
  });

  it("a null / non-finite cursor is OFF — returns the SAME scene unchanged", () => {
    const scene = temporalScene();
    expect(applyTimeFilter(scene, null)).toBe(scene);
    expect(applyTimeFilter(scene, undefined)).toBe(scene);
    expect(applyTimeFilter(scene, Number.NaN)).toBe(scene);
  });

  it("at the max cursor all timed elements are visible while untimed scaffolding remains excluded", () => {
    const filtered = applyTimeFilter(temporalScene(), T2);
    expect(filtered.nodes).toHaveLength(3);
    expect(filtered.edges).toHaveLength(2);
  });
});
