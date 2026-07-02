import { describe, expect, it } from "vitest";

import {
  buildStudioScene,
  type StudioSceneGraphLike,
  type StudioScene,
} from "../src/studio-scene.js";

// ---------------------------------------------------------------------------
// Shared scene contract — optional temporal (t / t_end, epoch-ms) on nodes and
// edges + scene-level layout/snapshot meta. These are PURE PASS-THROUGH: the
// builder must carry them WHEN PRESENT on the input and stay BYTE-IDENTICAL
// (no new keys) WHEN ABSENT. Nothing here may consume them (no render/layout/
// query change). See src/studio-scene.ts module-header SHARED SCENE CONTRACT.
// ---------------------------------------------------------------------------

/**
 * Base graph WITHOUT any contract field — the byte-identity baseline. Mirrors
 * the shape of the existing studio-scene fixtures (Sherlock corpus).
 */
const BASE_GRAPH: StudioSceneGraphLike = {
  nodes: [
    { id: "n1", label: "Sherlock", type: "Character", community: 1, community_name: "Detectives" },
    { id: "n2", label: "Watson", type: "Character", community: 1, community_name: "Detectives" },
    { id: "n3", label: "Moriarty", type: "Character", community: 2, community_name: "Villains" },
    { id: "n4", title: "The Final Problem", type: "Work", community: 3 },
  ],
  links: [
    { source: "n1", target: "n2", relation: "assists" },
    { source: "n1", target: "n3", relation: "opposes" },
    { source: "n1", target: "n4", relation: "appears_in" },
  ],
};

// Epoch-ms instants (1887/1891/1893/1894-ish) — large, realistic numbers so a
// verbatim pass-through is observable (no truncation / coercion).
const T_1887 = Date.UTC(1887, 2, 1);
const T_1891 = Date.UTC(1891, 4, 4);
const T_1893 = Date.UTC(1893, 11, 1);
const T_1894 = Date.UTC(1894, 3, 5);

/** Deep clone so a fixture mutation never leaks across cases. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** BASE_GRAPH enriched with temporal spans on every node + edge and scene meta. */
function temporalGraph(): StudioSceneGraphLike {
  const g = clone(BASE_GRAPH);
  const nodes = g.nodes ?? [];
  nodes[0]!.t = T_1887;
  nodes[0]!.t_end = T_1894; // span
  nodes[1]!.t = T_1887;
  nodes[1]!.t_end = T_1894;
  nodes[2]!.t = T_1891;
  nodes[2]!.t_end = T_1891; // point-in-time: t_end === t
  nodes[3]!.t = T_1893;
  nodes[3]!.t_end = T_1893;
  const links = g.links ?? [];
  links[0]!.t = T_1887;
  links[0]!.t_end = T_1894;
  links[1]!.t = T_1891;
  links[1]!.t_end = T_1894;
  links[2]!.t = T_1893;
  links[2]!.t_end = T_1893;
  g.layout_id = "fa2-2025-06-28";
  g.layout_dims = 3;
  g.snapshot_id = "snap_0xdeadbeef";
  return g;
}

describe("buildStudioScene — shared temporal/layout/snapshot contract", () => {
  it("carries node t/t_end verbatim WHEN PRESENT", () => {
    const scene = buildStudioScene(temporalGraph());
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    expect(byId.get("n1")).toMatchObject({ t: T_1887, t_end: T_1894 });
    expect(byId.get("n3")).toMatchObject({ t: T_1891, t_end: T_1891 }); // point-in-time
    // Values are the same epoch-ms numbers, not coerced/truncated.
    expect(byId.get("n1")!.t).toBe(T_1887);
    expect(byId.get("n1")!.t_end).toBe(T_1894);
  });

  it("carries edge t/t_end verbatim WHEN PRESENT", () => {
    const scene = buildStudioScene(temporalGraph());
    expect(scene.edges[0]).toMatchObject({ t: T_1887, t_end: T_1894 });
    expect(scene.edges[2]).toMatchObject({ t: T_1893, t_end: T_1893 });
  });

  it("carries scene-level layout_id / layout_dims / snapshot_id WHEN PRESENT", () => {
    const scene = buildStudioScene(temporalGraph());
    expect(scene.layout_id).toBe("fa2-2025-06-28");
    expect(scene.layout_dims).toBe(3);
    expect(scene.snapshot_id).toBe("snap_0xdeadbeef");
  });

  it("is BYTE-IDENTICAL (no new keys) WHEN ABSENT", () => {
    const plain = buildStudioScene(clone(BASE_GRAPH));
    // No node/edge carries a temporal key.
    for (const node of plain.nodes) {
      expect("t" in node).toBe(false);
      expect("t_end" in node).toBe(false);
    }
    for (const edge of plain.edges) {
      expect("t" in edge).toBe(false);
      expect("t_end" in edge).toBe(false);
    }
    // No scene-level meta key is emitted.
    expect("layout_id" in plain).toBe(false);
    expect("layout_dims" in plain).toBe(false);
    expect("snapshot_id" in plain).toBe(false);
  });

  it("PROOF: stripping the contract fields reproduces the absent-field scene exactly", () => {
    const withTemporal = buildStudioScene(temporalGraph());
    const without = buildStudioScene(clone(BASE_GRAPH));

    const strip = <T extends Record<string, unknown>>(o: T, keys: string[]): Record<string, unknown> => {
      const copy: Record<string, unknown> = { ...o };
      for (const k of keys) delete copy[k];
      return copy;
    };

    const strippedScene = {
      ...strip(withTemporal as unknown as Record<string, unknown>, [
        "layout_id",
        "layout_dims",
        "snapshot_id",
      ]),
      nodes: withTemporal.nodes.map((n) => strip(n as Record<string, unknown>, ["t", "t_end"])),
      edges: withTemporal.edges.map((e) => strip(e as Record<string, unknown>, ["t", "t_end"])),
    };

    // Byte-for-byte (key order + presence) equality with the absent-field scene.
    expect(JSON.stringify(strippedScene)).toBe(JSON.stringify(without));
  });

  it("ignores an invalid layout_dims (only 2 | 3 pass through)", () => {
    const g = clone(BASE_GRAPH);
    (g as { layout_dims?: unknown }).layout_dims = 4; // not 2|3 -> omitted
    const scene = buildStudioScene(g);
    expect("layout_dims" in scene).toBe(false);
  });

  it("does NOT consume temporal fields (stats unchanged by t/t_end)", () => {
    // The contract is pass-through only: adding temporal data must not change
    // any derived value (stats, communityColors).
    const withTemporal: StudioScene = buildStudioScene(temporalGraph());
    const without: StudioScene = buildStudioScene(clone(BASE_GRAPH));
    expect(withTemporal.stats).toEqual(without.stats);
    expect(withTemporal.communityColors).toEqual(without.communityColors);
  });
});
