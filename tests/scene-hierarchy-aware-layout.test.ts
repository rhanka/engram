import { describe, expect, it } from "vitest";

import { computeHierarchyAwarePositions } from "../src/hierarchy-layout.js";
import type { HierarchyLayoutForest } from "../src/hierarchy-layout.js";
import {
  HIERARCHY_AWARE_SCENE_LAYOUT_ID,
  applySceneLayout,
  attachHierarchyAwarePositions,
  resolveSceneLayoutId,
  selectDefaultSceneLayoutId,
} from "../src/scene-layout.js";

/** A 3-level forest: two roots, the first with two children, one grandchild. */
function forest(): HierarchyLayoutForest {
  return {
    root_ids: ["DE", "EN"],
    nodes_by_id: {
      DE: { parent_id: null, child_ids: ["DE.AI", "DE.PA"] },
      "DE.AI": { parent_id: "DE", child_ids: ["DE.AI.01"] },
      "DE.AI.01": { parent_id: "DE.AI", child_ids: [] },
      "DE.PA": { parent_id: "DE", child_ids: [] },
      EN: { parent_id: null, child_ids: [] },
    },
  };
}

function scene(ids: string[], types: Record<string, string> = {}) {
  return {
    nodes: ids.map((id) => ({
      id: `node:${id}`,
      registry_record_id: id,
      ...(types[id] ? { type: types[id] } : {}),
    })),
    edges: [] as Array<{ source: string; target: string }>,
  };
}

const ALL = ["DE", "DE.AI", "DE.AI.01", "DE.PA", "EN"];

function radius(position: { x: number; y: number }, origin: { x: number; y: number }): number {
  return Math.hypot(position.x - origin.x, position.y - origin.y);
}

describe("hierarchy-aware layout", () => {
  it("places every node exactly once", () => {
    const nodes = scene(ALL).nodes;
    const result = computeHierarchyAwarePositions(nodes, { t: forest() });

    expect(result.positions).toHaveLength(nodes.length * 2);
    expect(result.hierarchyNodeCount).toBe(5);
    expect(result.looseNodeCount).toBe(0);
    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isFinite(result.positions[i])).toBe(true);
    }
  });

  it("puts depth on the radius: deeper nodes sit further from the cluster centre", () => {
    const nodes = scene(ALL).nodes;
    const { positions } = computeHierarchyAwarePositions(nodes, { t: forest() });
    const at = (id: string) => {
      const index = ALL.indexOf(id);
      return { x: positions[index * 2]!, y: positions[index * 2 + 1]! };
    };
    // The whole forest is one cluster, so its centre is the shared origin. Use
    // a root's own ring as the reference rather than assuming (0,0).
    const centre = { x: 0, y: 0 };
    const rootR = radius(at("DE"), centre);
    const childR = radius(at("DE.AI"), centre);
    const grandChildR = radius(at("DE.AI.01"), centre);

    expect(childR).toBeGreaterThan(rootR);
    expect(grandChildR).toBeGreaterThan(childR);
  });

  it("separates distinct hierarchies into distinct clusters", () => {
    const other: HierarchyLayoutForest = {
      root_ids: ["AB"],
      nodes_by_id: { AB: { parent_id: null, child_ids: [] } },
    };
    const ids = [...ALL, "AB"];
    const nodes = scene(ids).nodes;
    const result = computeHierarchyAwarePositions(nodes, { a_tree: forest(), b_tree: other });

    expect(result.clusterCount).toBe(2);
    const abIndex = ids.indexOf("AB");
    const deIndex = ids.indexOf("DE");
    const gap = Math.hypot(
      result.positions[abIndex * 2]! - result.positions[deIndex * 2]!,
      result.positions[abIndex * 2 + 1]! - result.positions[deIndex * 2 + 1]!,
    );
    // Different clusters occupy different grid cells, so they cannot coincide.
    expect(gap).toBeGreaterThan(0);
  });

  it("groups non-hierarchy nodes into per-type clusters", () => {
    const ids = [...ALL, "loose-a", "loose-b", "loose-c"];
    const nodes = scene(ids, {
      "loose-a": "Tool",
      "loose-b": "Tool",
      "loose-c": "Method",
    }).nodes;
    const result = computeHierarchyAwarePositions(nodes, { t: forest() });

    expect(result.hierarchyNodeCount).toBe(5);
    expect(result.looseNodeCount).toBe(3);
    // 1 forest + 2 type clusters.
    expect(result.clusterCount).toBe(3);
  });

  it("is deterministic — identical inputs give identical positions", () => {
    const first = computeHierarchyAwarePositions(scene(ALL).nodes, { t: forest() });
    const second = computeHierarchyAwarePositions(scene(ALL).nodes, { t: forest() });
    expect([...second.positions]).toEqual([...first.positions]);
  });

  it("does not collapse a large forest onto a single point (no filament/blob)", () => {
    // 300 leaves under one root: a degenerate layout would stack them.
    const ids = ["R"];
    const children: string[] = [];
    for (let i = 0; i < 300; i++) {
      const id = `R.${String(i).padStart(3, "0")}`;
      ids.push(id);
      children.push(id);
    }
    const wide: HierarchyLayoutForest = {
      root_ids: ["R"],
      nodes_by_id: {
        R: { parent_id: null, child_ids: children },
        ...Object.fromEntries(
          children.map((id) => [id, { parent_id: "R", child_ids: [] }]),
        ),
      },
    };
    const { positions } = computeHierarchyAwarePositions(scene(ids).nodes, { wide });
    const distinct = new Set<string>();
    for (let i = 0; i < ids.length; i++) {
      distinct.add(`${positions[i * 2]!.toFixed(3)},${positions[i * 2 + 1]!.toFixed(3)}`);
    }
    expect(distinct.size).toBe(ids.length);
  });

  it("pins positions and stamps the scene contract", () => {
    const target = scene(ALL);
    attachHierarchyAwarePositions(target, { t: forest() });

    expect(target.layout_id).toBe(HIERARCHY_AWARE_SCENE_LAYOUT_ID);
    expect(target.layout_dims).toBe(2);
    for (const node of target.nodes) {
      expect(node.fx).toBe(node.x);
      expect(node.fy).toBe(node.y);
    }
  });

  it("falls back to the force bake when no forest is usable", () => {
    const target = scene(ALL);
    attachHierarchyAwarePositions(target, { empty: { root_ids: [], nodes_by_id: {} } });
    // The force path deliberately stamps no layout_id (byte-identity).
    expect(target.layout_id).toBeUndefined();
    for (const node of target.nodes) expect(Number.isFinite(node.x)).toBe(true);
  });

  it("routes through applySceneLayout with the hierarchies option", () => {
    const target = scene(ALL);
    applySceneLayout(target, "hierarchy-aware", { hierarchies: { t: forest() } });
    expect(target.layout_id).toBe(HIERARCHY_AWARE_SCENE_LAYOUT_ID);
  });

  it("resolves the id from an explicit value", () => {
    expect(resolveSceneLayoutId("hierarchy-aware")).toBe("hierarchy-aware");
    expect(resolveSceneLayoutId("nonsense")).toBe("force");
  });

  it("defaults to hierarchy-aware only for a corpus with declared hierarchies", () => {
    expect(selectDefaultSceneLayoutId({ hasHierarchies: true })).toBe("hierarchy-aware");
    expect(selectDefaultSceneLayoutId({ hasHierarchies: false })).toBe("force");
    // An explicit request always wins over the default.
    expect(
      selectDefaultSceneLayoutId({ hasHierarchies: true, explicit: "force" }),
    ).toBe("force");
    expect(
      selectDefaultSceneLayoutId({ hasHierarchies: false, explicit: "typed-layer" }),
    ).toBe("typed-layer");
  });
});
