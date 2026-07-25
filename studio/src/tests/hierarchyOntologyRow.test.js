import { describe, expect, it } from "vitest";

import { computeDisplayHiddenIds, expandHierarchyRefs } from "../lib/entityVisibility.js";
import { buildHierarchyCollapseIndex, computeGroupedGraph } from "../lib/groupBy.js";
import {
  groupKeyForHierarchy,
  groupKeyForOntology,
  parseHierarchyKey,
  splitGroupedKeys,
  setEntityState,
  clearOntologyGrouping,
  hasOntologyGrouping,
  createDefaultViewerState,
} from "../lib/viewerState.js";

/* ===========================================================================
 * A registry-FOREST row IS an ontology row.
 *
 * The rail used to give the class rows (Process / ABP / Tool / Data …) an eye —
 * the 4-state visibility control — while the process-tree rows spliced beneath
 * them (`DE Develop L0 5`, `EN Enable L0 4`, and every deeper level) got only an
 * expand triangle. That splits ONE ontology into "rows you can show/hide" and
 * "rows you can only look at", which makes no sense: the process hierarchy IS
 * part of the ontology.
 *
 * These lock the contract on the generic side (studio core): any repo whose
 * taxonomy binds a forest via `member_hierarchies` gets show/hide/solo/group on
 * every tree node, governing that node's whole SUBTREE.
 * ======================================================================== */

// A two-level forest joined to the graph on `registry_record_id`:
//   DE ── DE.AI ── DE.AI.01
//      └─ DE.BI
//   EN (a second root, no children)
const sceneHierarchies = {
  hierarchies: {
    proc_tree: {
      root_ids: ["DE", "EN"],
      nodes_by_id: {
        DE: { child_ids: ["DE.AI", "DE.BI"], level: 0, label: "Develop" },
        "DE.AI": { child_ids: ["DE.AI.01"], level: 1, label: "Analyse" },
        "DE.AI.01": { child_ids: [], level: 2, label: "Assess" },
        "DE.BI": { child_ids: [], level: 1, label: "Build" },
        EN: { child_ids: [], level: 0, label: "Enable" },
      },
    },
    org_tree: {
      root_ids: ["DE"], // the SAME code in another forest — must not cross-hide.
      nodes_by_id: { DE: { child_ids: [], level: 0, label: "Delivery unit" } },
    },
  },
};

function graphNodes() {
  return [
    { id: "n-de", node_type: "Proc", registry_record_id: "DE" },
    { id: "n-de-ai", node_type: "Proc", registry_record_id: "DE.AI" },
    { id: "n-de-ai-01", node_type: "Proc", registry_record_id: "DE.AI.01" },
    { id: "n-de-bi", node_type: "Proc", registry_record_id: "DE.BI" },
    { id: "n-en", node_type: "Proc", registry_record_id: "EN" },
    // An entity outside every forest — it must never be touched by a tree row.
    { id: "n-loose", node_type: "Tool" },
  ];
}

const sorted = (s) => [...s].sort();

describe("hierarchy keys — the SAME namespaced vocabulary as a class row", () => {
  it("round-trips forest + node through the key", () => {
    const key = groupKeyForHierarchy("proc_tree", "DE.AI.01");
    expect(key).toBe("hierarchy:proc_tree:DE.AI.01");
    expect(parseHierarchyKey(key)).toEqual({ forestKey: "proc_tree", nodeId: "DE.AI.01" });
  });

  it("keeps a node id that itself contains a colon intact", () => {
    const key = groupKeyForHierarchy("f", "a:b:c");
    expect(parseHierarchyKey(key)).toEqual({ forestKey: "f", nodeId: "a:b:c" });
  });

  it("splits into its own axis without disturbing the other three", () => {
    const split = splitGroupedKeys([
      groupKeyForOntology("class:ABP"),
      groupKeyForHierarchy("proc_tree", "DE"),
      groupKeyForHierarchy("org_tree", "DE"),
      "community:Hound",
      "type:Character",
    ]);
    expect(split.ontologyClassIds).toEqual(["class:ABP"]);
    expect(split.communityKeys).toEqual(["Hound"]);
    expect(split.typeNames).toEqual(["Character"]);
    // Same code, two forests ⇒ two DISTINCT refs (never collapsed together).
    expect(split.hierarchyRefs).toEqual([
      { forestKey: "proc_tree", nodeId: "DE" },
      { forestKey: "org_tree", nodeId: "DE" },
    ]);
  });

  it("ignores a malformed hierarchy key rather than minting a junk ref", () => {
    expect(splitGroupedKeys(["hierarchy:", "hierarchy:onlyforest"]).hierarchyRefs).toEqual([]);
  });

  it("survives the state normalizer (the namespace is known)", () => {
    const next = setEntityState(
      createDefaultViewerState(),
      groupKeyForHierarchy("proc_tree", "DE"),
      "hidden",
    );
    expect(next.options.visibility.hidden).toEqual(["hierarchy:proc_tree:DE"]);
  });

  it("counts as ONTOLOGY-scoped grouping (the section's Ungroup all reaches it)", () => {
    const grouped = setEntityState(
      createDefaultViewerState(),
      groupKeyForHierarchy("proc_tree", "DE"),
      "grouped",
    );
    expect(hasOntologyGrouping(grouped)).toBe(true);
    expect(clearOntologyGrouping(grouped).options.groupBy.grouped).toEqual([]);
  });
});

describe("expandHierarchyRefs — a tree row owns its whole SUBTREE", () => {
  it("expands a root to every descendant record", () => {
    const out = expandHierarchyRefs([{ forestKey: "proc_tree", nodeId: "DE" }], sceneHierarchies);
    expect(sorted(out)).toEqual(["DE", "DE.AI", "DE.AI.01", "DE.BI"]);
  });

  it("expands a MID-level row to just its own branch", () => {
    const out = expandHierarchyRefs([{ forestKey: "proc_tree", nodeId: "DE.AI" }], sceneHierarchies);
    expect(sorted(out)).toEqual(["DE.AI", "DE.AI.01"]);
  });

  it("scopes to the ref's OWN forest (same code elsewhere is untouched)", () => {
    expect(sorted(expandHierarchyRefs([{ forestKey: "org_tree", nodeId: "DE" }], sceneHierarchies))).toEqual(["DE"]);
  });

  it("contributes nothing for an unknown forest / node / absent sidecar", () => {
    expect(expandHierarchyRefs([{ forestKey: "nope", nodeId: "DE" }], sceneHierarchies).size).toBe(0);
    expect(expandHierarchyRefs([{ forestKey: "proc_tree", nodeId: "??" }], sceneHierarchies).size).toBe(0);
    expect(expandHierarchyRefs([{ forestKey: "proc_tree", nodeId: "DE" }], null).size).toBe(0);
  });

  it("terminates on a cyclic artifact instead of recursing forever", () => {
    const cyclic = {
      hierarchies: { t: { root_ids: ["a"], nodes_by_id: { a: { child_ids: ["b"] }, b: { child_ids: ["a"] } } } },
    };
    expect(sorted(expandHierarchyRefs([{ forestKey: "t", nodeId: "a" }], cyclic))).toEqual(["a", "b"]);
  });
});

describe("HIDE on a tree row hides its subtree in the graph (defect 1)", () => {
  it("hiding a mid-level node hides that node and everything below it — nothing else", () => {
    const out = computeDisplayHiddenIds({
      nodes: graphNodes(),
      hiddenKeys: [groupKeyForHierarchy("proc_tree", "DE.AI")],
      soloKeys: [],
      sceneHierarchies,
    });
    expect(sorted(out)).toEqual(["n-de-ai", "n-de-ai-01"]);
  });

  it("hiding a ROOT row hides the whole tree branch", () => {
    const out = computeDisplayHiddenIds({
      nodes: graphNodes(),
      hiddenKeys: [groupKeyForHierarchy("proc_tree", "DE")],
      soloKeys: [],
      sceneHierarchies,
    });
    expect(sorted(out)).toEqual(["n-de", "n-de-ai", "n-de-ai-01", "n-de-bi"]);
  });

  it("SHOW ONLY on a tree row keeps its subtree and masks the rest", () => {
    const out = computeDisplayHiddenIds({
      nodes: graphNodes(),
      hiddenKeys: [],
      soloKeys: [groupKeyForHierarchy("proc_tree", "DE.AI")],
      sceneHierarchies,
    });
    expect(sorted(out)).toEqual(["n-de", "n-de-bi", "n-en", "n-loose"]);
  });

  it("Solo on a subtree overrides that subtree's own stored Hidden (§3/§6.2)", () => {
    const out = computeDisplayHiddenIds({
      nodes: graphNodes(),
      hiddenKeys: [groupKeyForHierarchy("proc_tree", "DE.AI")],
      soloKeys: [groupKeyForHierarchy("proc_tree", "DE.AI")],
      sceneHierarchies,
    });
    expect(out.has("n-de-ai")).toBe(false);
    expect(out.has("n-de-ai-01")).toBe(false);
  });

  it("is a NO-OP when the repo binds no forests (mystery / immo stay untouched)", () => {
    const out = computeDisplayHiddenIds({
      nodes: graphNodes(),
      hiddenKeys: [groupKeyForHierarchy("proc_tree", "DE")],
      soloKeys: [],
      sceneHierarchies: null,
    });
    expect(out.size).toBe(0);
  });
});

describe("GROUP on a tree row folds its subtree INTO that node", () => {
  it("indexes the subtree against the graph join", () => {
    const idx = buildHierarchyCollapseIndex({ nodes: graphNodes() }, sceneHierarchies, [
      { forestKey: "proc_tree", nodeId: "DE" },
    ]);
    expect(idx.collapseTargets).toEqual(["n-de"]);
    expect(sorted(idx.descendantsByTarget.get("n-de"))).toEqual([
      "n-de-ai",
      "n-de-ai-01",
      "n-de-bi",
    ]);
    // child -> parent, so a folded edge bubbles to the target.
    expect(idx.parentById.get("n-de-ai-01")).toBe("n-de-ai");
    expect(idx.parentById.get("n-de-ai")).toBe("n-de");
  });

  it("removes the descendants from the grouped graph but KEEPS the target node", () => {
    const graph = {
      nodes: graphNodes(),
      links: [
        { source: "n-de-ai-01", target: "n-loose", relation: "uses" },
        { source: "n-de", target: "n-de-ai", relation: "parent_of" },
      ],
    };
    const out = computeGroupedGraph({
      graph,
      sceneHierarchies,
      grouped: [groupKeyForHierarchy("proc_tree", "DE")],
    });
    const ids = out.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["n-de", "n-en", "n-loose"]);
    // The edge out of the folded leaf re-endpoints onto the fold target.
    expect(out.links.some((l) => l.source === "n-de" && l.target === "n-loose")).toBe(true);
  });

  it("is the FAST PATH (input graph by reference) when nothing is grouped", () => {
    const graph = { nodes: graphNodes(), links: [] };
    expect(computeGroupedGraph({ graph, sceneHierarchies, grouped: [] })).toBe(graph);
  });

  it("ignores a grouped forest node with no sidecar (never throws)", () => {
    const graph = { nodes: graphNodes(), links: [] };
    const out = computeGroupedGraph({
      graph,
      sceneHierarchies: null,
      grouped: [groupKeyForHierarchy("proc_tree", "DE")],
    });
    expect(out.nodes.map((n) => n.id)).toContain("n-de-ai");
  });
});
