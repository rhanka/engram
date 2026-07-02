import { describe, expect, it } from "vitest";

import {
  SCENE_HIERARCHIES_SCHEMA,
  buildSceneHierarchySidecar,
  type SceneHierarchySidecar,
} from "../src/scene-hierarchies.js";
import { buildHierarchyIndex } from "../src/ontology-hierarchies.js";
import type { OntologyHierarchyArc, OntologyStatus } from "../src/types.js";

function arc(
  hierarchyId: string,
  parentId: string,
  childId: string,
  status: OntologyStatus = "reference",
  extra: Partial<OntologyHierarchyArc> = {},
): OntologyHierarchyArc {
  return {
    hierarchy_id: hierarchyId,
    parent_id: parentId,
    child_id: childId,
    level: 0,
    type: "parent_of",
    source: "profile",
    status,
    confidence: 1.0,
    ...extra,
  };
}

function ids(...values: string[]): Set<string> {
  return new Set(values);
}

/** Strip the only non-deterministic field for full-value comparisons. */
function stable(sidecar: SceneHierarchySidecar): Omit<SceneHierarchySidecar, "generated_at"> {
  const { generated_at: _generatedAt, ...rest } = sidecar;
  return rest;
}

describe("buildSceneHierarchySidecar — graphify_scene_hierarchies_v1", () => {
  it("returns the envelope with hierarchies:{} for empty arcs", () => {
    const sidecar = buildSceneHierarchySidecar({ arcs: [], sceneNodeIds: ids() });
    expect(sidecar.schema).toBe(SCENE_HIERARCHIES_SCHEMA);
    expect(sidecar.schema).toBe("graphify_scene_hierarchies_v1");
    expect(sidecar.hierarchies).toEqual({});
    expect(sidecar.graph_hash).toBeNull();
    expect(typeof sidecar.generated_at).toBe("string");
  });

  it("stamps graph_hash when provided", () => {
    const sidecar = buildSceneHierarchySidecar({
      arcs: [],
      sceneNodeIds: ids(),
      graphHash: "abc123",
    });
    expect(sidecar.graph_hash).toBe("abc123");
  });

  it("builds a simple lane-1 tree: roots, levels, child_ids, max_depth, kind", () => {
    const arcs = [
      arc("h", "root", "a"),
      arc("h", "root", "b"),
      arc("h", "a", "a1", "validated"),
    ];
    const sidecar = buildSceneHierarchySidecar({
      arcs,
      sceneNodeIds: ids("root", "a", "b", "a1"),
    });
    const h = sidecar.hierarchies["h"]!;
    expect(h.relation_type).toBe("parent_of");
    expect(h.kind).toBe("tree");
    expect(h.root_ids).toEqual(["root"]);
    expect(h.max_depth).toBe(2);
    expect(h.orphan_ids).toEqual([]);
    expect(h.cycles).toEqual([]);
    expect(h.conflicts).toEqual([]);
    expect(h.overlay_arcs).toEqual([]);
    expect(h.dangling_arc_count).toBe(0);

    expect(h.nodes_by_id["root"]).toEqual({
      parent_id: null,
      child_ids: ["a", "b"],
      level: 0,
      status: "reference",
      registry_record_id: "root",
    });
    expect(h.nodes_by_id["a"]).toMatchObject({ parent_id: "root", level: 1, child_ids: ["a1"] });
    // status is carried by the CHILD entry (the arc that attached it).
    expect(h.nodes_by_id["a1"]).toMatchObject({
      parent_id: "a",
      level: 2,
      child_ids: [],
      status: "validated",
    });
  });

  it("lane-splits by status: reference/validated → tree, the rest → overlay_arcs", () => {
    const arcs = [
      arc("h", "r", "a", "reference"),
      arc("h", "r", "b", "validated"),
      arc("h", "a", "c", "proposed", { confidence: 0.7, evidence_refs: ["doc#1"] }),
      arc("h", "b", "c", "inferred", { confidence: 0.4 }),
      arc("h", "a", "b", "candidate"),
      arc("h", "c", "d", "guessed"),
      arc("h", "d", "e", "rejected"),
      arc("h", "e", "f", "superseded"),
    ];
    const h = buildSceneHierarchySidecar({
      arcs,
      sceneNodeIds: ids("r", "a", "b", "c", "d", "e", "f"),
    }).hierarchies["h"]!;

    // Tree only contains the lane-1 arcs.
    expect(Object.keys(h.nodes_by_id).sort()).toEqual(["a", "b", "r"]);
    expect(h.nodes_by_id["a"]!.status).toBe("reference");
    expect(h.nodes_by_id["b"]!.status).toBe("validated");
    // `c` only appears via overlays — never as a tree entry.
    expect(h.nodes_by_id["c"]).toBeUndefined();

    expect(h.overlay_arcs).toEqual([
      { parent_id: "a", child_id: "b", status: "candidate", confidence: 1.0 },
      { parent_id: "a", child_id: "c", status: "proposed", confidence: 0.7, evidence_refs: ["doc#1"] },
      { parent_id: "b", child_id: "c", status: "inferred", confidence: 0.4 },
      { parent_id: "c", child_id: "d", status: "guessed", confidence: 1.0 },
      { parent_id: "d", child_id: "e", status: "rejected", confidence: 1.0 },
      { parent_id: "e", child_id: "f", status: "superseded", confidence: 1.0 },
    ]);
    expect(h.conflicts).toEqual([]);
    expect(h.dangling_arc_count).toBe(0);
  });

  it("enforces mono-parent deterministically: first wins by stable sort, losers → conflicts + overlay", () => {
    const base = [
      arc("h", "p2", "x", "validated"),
      arc("h", "p1", "x", "reference", { evidence_refs: ["reg#row42"] }),
      arc("h", "r", "p1"),
      arc("h", "r", "p2"),
    ];
    const scene = ids("r", "p1", "p2", "x");
    const h = buildSceneHierarchySidecar({ arcs: base, sceneNodeIds: scene }).hierarchies["h"]!;

    // p1 < p2 → p1 wins regardless of input order.
    expect(h.nodes_by_id["x"]).toMatchObject({ parent_id: "p1", level: 2, status: "reference" });
    expect(h.conflicts).toEqual([
      { child_id: "x", kept_parent_id: "p1", demoted_parent_ids: ["p2"] },
    ]);
    expect(h.overlay_arcs).toEqual([
      {
        parent_id: "p2",
        child_id: "x",
        status: "proposed",
        confidence: 1.0,
        derivation_method: "mono_parent_demotion",
      },
    ]);
    expect(h.nodes_by_id["p2"]!.child_ids).toEqual([]); // demoted arc is not a tree edge

    // Determinism: reversed input order yields the exact same artifact.
    const reversed = buildSceneHierarchySidecar({
      arcs: [...base].reverse(),
      sceneNodeIds: scene,
    });
    expect(stable(reversed)).toEqual(
      stable(buildSceneHierarchySidecar({ arcs: base, sceneNodeIds: scene })),
    );
  });

  it("collapses exact duplicate arcs without a conflict", () => {
    const h = buildSceneHierarchySidecar({
      arcs: [arc("h", "r", "a"), arc("h", "r", "a")],
      sceneNodeIds: ids("r", "a"),
    }).hierarchies["h"]!;
    expect(h.conflicts).toEqual([]);
    expect(h.overlay_arcs).toEqual([]);
    expect(h.nodes_by_id["a"]!.parent_id).toBe("r");
  });

  it("promotes orphans to roots (parent absent from sceneNodeIds) and lists orphan_ids", () => {
    const arcs = [
      arc("h", "missing", "org:CODE", "validated"),
      arc("h", "org:CODE", "leaf"),
      arc("h", "r", "a"),
    ];
    const h = buildSceneHierarchySidecar({
      arcs,
      sceneNodeIds: ids("org:CODE", "leaf", "r", "a"),
    }).hierarchies["h"]!;

    expect(h.orphan_ids).toEqual(["org:CODE"]);
    expect(h.root_ids).toEqual(["org:CODE", "r"]);
    expect(h.kind).toBe("forest");
    // Promoted root: parent null, level 0, status from the tolerated arc.
    expect(h.nodes_by_id["org:CODE"]).toEqual({
      parent_id: null,
      child_ids: ["leaf"],
      level: 0,
      status: "validated",
      registry_record_id: "org:CODE",
    });
    expect(h.nodes_by_id["leaf"]).toMatchObject({ parent_id: "org:CODE", level: 1 });
    // The tolerated arc is accounted for by the promotion — not dangling.
    expect(h.dangling_arc_count).toBe(0);
  });

  it("promotes a leaf orphan (no children) to a level-0 root entry", () => {
    const h = buildSceneHierarchySidecar({
      arcs: [arc("h", "ghost", "alone")],
      sceneNodeIds: ids("alone"),
    }).hierarchies["h"]!;
    expect(h.orphan_ids).toEqual(["alone"]);
    expect(h.root_ids).toEqual(["alone"]);
    expect(h.nodes_by_id["alone"]).toEqual({
      parent_id: null,
      child_ids: [],
      level: 0,
      status: "reference",
      registry_record_id: "alone",
    });
  });

  it("counts dangling arcs: unknown child, or absent parent when the child already has one", () => {
    const arcs = [
      arc("h", "r", "a"),
      arc("h", "r", "unknown-child"), // child not in scene → dangling
      arc("h", "ghost", "a"), // a already parented by r → dangling
      arc("h", "ghost", "overlay-child", "proposed"), // overlay needs both endpoints → dangling
    ];
    const h = buildSceneHierarchySidecar({
      arcs,
      sceneNodeIds: ids("r", "a", "overlay-child"),
    }).hierarchies["h"]!;
    expect(h.dangling_arc_count).toBe(3);
    expect(h.orphan_ids).toEqual([]);
    expect(h.overlay_arcs).toEqual([]);
    expect(h.nodes_by_id["a"]!.parent_id).toBe("r");
  });

  it("reports cycles with buildHierarchyIndex parity and excludes cycle nodes from the tree", () => {
    const cycleArcs = [
      arc("h", "c1", "c2"),
      arc("h", "c2", "c3"),
      arc("h", "c3", "c1"),
      arc("h", "r", "a"),
    ];
    const h = buildSceneHierarchySidecar({
      arcs: cycleArcs,
      sceneNodeIds: ids("c1", "c2", "c3", "r", "a"),
    }).hierarchies["h"]!;

    const index = buildHierarchyIndex(cycleArcs);
    // Parity on cycle MEMBERSHIP (the cycle path representation is
    // rotation-equivalent: DFS start order may differ once arcs are
    // stably re-sorted by the mono-parent pass).
    const cycleNodeSet = (cycles: string[][]) =>
      cycles.map((c) => [...new Set(c)].sort());
    expect(cycleNodeSet(h.cycles)).toEqual(cycleNodeSet(index.cycles));
    expect(h.cycles.length).toBe(1);
    expect(h.root_ids).toEqual(index.root_ids); // cycle nodes excluded from roots
    expect(h.max_depth).toBe(index.depth);
    // Cycle members carry no tree entry; the clean branch is intact.
    expect(Object.keys(h.nodes_by_id).sort()).toEqual(["a", "r"]);
  });

  it("splits multiple hierarchies sharing ids into independent trees", () => {
    const arcs = [
      arc("alpha", "AM01", "AM0104"),
      arc("alpha", "AM0104", "AM0104.01"),
      arc("beta", "DE", "AM0104.01", "validated", { type: "maps_to" }),
    ];
    const sidecar = buildSceneHierarchySidecar({
      arcs,
      sceneNodeIds: ids("AM01", "AM0104", "AM0104.01", "DE"),
      specs: { beta: { relation_type: "maps_to_spec" } },
    });

    expect(Object.keys(sidecar.hierarchies)).toEqual(["alpha", "beta"]);
    const alpha = sidecar.hierarchies["alpha"]!;
    const beta = sidecar.hierarchies["beta"]!;

    // Same raw id, independent placement per hierarchy.
    expect(alpha.nodes_by_id["AM0104.01"]).toMatchObject({ parent_id: "AM0104", level: 2 });
    expect(beta.nodes_by_id["AM0104.01"]).toMatchObject({ parent_id: "DE", level: 1, status: "validated" });
    // relation_type: spec override wins, else first arc's type.
    expect(alpha.relation_type).toBe("parent_of");
    expect(beta.relation_type).toBe("maps_to_spec");
  });

  it("keeps raw ids verbatim lossless as join keys (D2: no `.`/`-`→`_`)", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const arcs = [
      arc("h", "AM0104", "AM0104.01"),
      arc("h", "AM0104.01", "DE.AI.01"),
      arc("h", "DE.AI.01", uuid),
      arc("h", uuid, "org:CODE"),
    ];
    const sceneNodeIds = ids("AM0104", "AM0104.01", "DE.AI.01", uuid, "org:CODE");
    const h = buildSceneHierarchySidecar({ arcs, sceneNodeIds }).hierarchies["h"]!;

    for (const raw of sceneNodeIds) {
      const entry = h.nodes_by_id[raw];
      expect(entry, raw).toBeDefined();
      expect(entry!.registry_record_id).toBe(raw); // verbatim
    }
    // No slugged collision artifacts ever appear as keys.
    for (const key of Object.keys(h.nodes_by_id)) {
      expect(sceneNodeIds.has(key), key).toBe(true);
    }
    expect(h.nodes_by_id["AM0104_01"]).toBeUndefined();
    expect(h.nodes_by_id["DE_AI_01"]).toBeUndefined();
    expect(h.nodes_by_id[uuid.replace(/-/g, "_")]).toBeUndefined();
    expect(h.nodes_by_id["org_CODE"]).toBeUndefined();
  });

  it("round-trips through JSON cleanly (the artifact is pure data)", () => {
    const sidecar = buildSceneHierarchySidecar({
      arcs: [arc("h", "r", "a"), arc("h", "r", "b", "validated")],
      sceneNodeIds: ids("r", "a", "b"),
      graphHash: "deadbeef",
    });
    expect(JSON.parse(JSON.stringify(sidecar))).toEqual(sidecar);
  });
});
