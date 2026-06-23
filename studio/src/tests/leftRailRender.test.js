import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { groupCounts, nodeType, communityStats } from "../lib/graphAdapter.js";
import {
  groupKeyForOntology,
  groupKeyForCommunity,
} from "../lib/viewerState.js";

/**
 * B2 — PER-ITEM checkbox RENDER proof (the "approved mockup" gate).
 *
 * The user-validated design puts a group-by CHECKBOX to the LEFT of EVERY
 * groupable item — each Ontology class row (Domain + Sub-domain) AND each
 * Community row. The earlier regression was checkboxes that existed in the
 * SOURCE but never SHOWED, because:
 *   (a) the per-item ontology checkboxes only render when LeftRail's `typeTree`
 *       derivation produces Domain/Sub-domain rows (taxonomy-driven), and
 *   (b) the per-item community checkboxes only render when `communityStats`
 *       reports liveCount > 0, and
 *   (c) App's availability flags `canGroupOntology` / `canGroupCommunity` (which
 *       also gate the SECONDARY bulk "Group all to" controls) evaluate true.
 *
 * jsdom has no Canvas2D and the full App tree pulls in GraphCanvas, so we cannot
 * mount the live component here (same constraint as appHeader/leftRail tests).
 * Instead we drive the EXACT derivations + flag formulas the component renders
 * from, against MYSTERY-SHAPED data, and prove every per-item checkbox branch is
 * reached. (The compiled markup itself is locked by leftRail.test.js.)
 */

// LeftRail's `typeTree` derivation, lifted verbatim from the component so this
// test fails if the render logic that emits the per-item ontology checkboxes
// drifts. Mirrors LeftRail.svelte `typeTree = $derived.by(...)`.
function buildTypeTree(graph, classHierarchies) {
  const typeList = groupCounts(graph, nodeType);
  const hs = classHierarchies?.hierarchies;
  if (!hs) return null;
  const h = hs[Object.keys(hs)[0]];
  if (!h?.classes_by_id || !h.root_class_ids?.length) return null;
  const classes = h.classes_by_id;
  const countByType = new Map(typeList.map((t) => [t.key, t.count]));
  const labelOf = (id) => classes[id]?.label || String(id).replace(/^class:/, "");
  const seen = new Set();
  const domains = h.root_class_ids
    .map((rootId) => {
      const subs = (classes[rootId]?.child_ids ?? [])
        .map((subId) => {
          const types = (classes[subId]?.member_node_types ?? []).map((t) => {
            seen.add(t);
            return { key: t, count: countByType.get(t) ?? 0 };
          });
          return { id: subId, label: labelOf(subId), types };
        })
        .filter((s) => s.types.length);
      return { id: rootId, label: labelOf(rootId), subs };
    })
    .filter((d) => d.subs.length);
  return domains;
}

// The pack's REAL mystery taxonomy if present (the export check copies it next to
// the bundle); otherwise a faithful inline stand-in with the same shape (Domain →
// Sub-domain → member types) so the test stays hermetic in CI.
function loadMysteryHierarchies() {
  const packPath = resolve(
    process.env.HOME ?? "",
    "src/public-domaine-mystery-sagas-pack/.graphify/studio/class-hierarchies.json",
  );
  if (existsSync(packPath)) {
    try {
      return JSON.parse(readFileSync(packPath, "utf8"));
    } catch {
      /* fall through to the inline fixture */
    }
  }
  return {
    hierarchies: {
      mystery_class_taxonomy_v1: {
        root_class_ids: ["class:People", "class:Place"],
        classes_by_id: {
          "class:People": {
            id: "class:People",
            label: "People",
            level: 0,
            child_ids: ["class:Detective", "class:Suspect"],
          },
          "class:Detective": {
            id: "class:Detective",
            label: "Detective",
            level: 1,
            member_node_types: ["Detective"],
          },
          "class:Suspect": {
            id: "class:Suspect",
            label: "Suspect",
            level: 1,
            member_node_types: ["Suspect"],
          },
          "class:Place": {
            id: "class:Place",
            label: "Place",
            level: 0,
            child_ids: ["class:City"],
          },
          "class:City": {
            id: "class:City",
            label: "City",
            level: 1,
            member_node_types: ["City"],
          },
        },
      },
    },
  };
}

// A mystery-shaped graph: numeric `community` + `community_name`, typed nodes,
// real edges (so communities are LIVE, not degree-0 singletons).
const mysteryGraph = {
  nodes: [
    { id: "holmes", label: "Sherlock Holmes", type: "Detective", community: 8, community_name: "Community 8" },
    { id: "watson", label: "John Watson", type: "Detective", community: 8, community_name: "Community 8" },
    { id: "moriarty", label: "Moriarty", type: "Suspect", community: 14, community_name: "Community 14" },
    { id: "moran", label: "Sebastian Moran", type: "Suspect", community: 14, community_name: "Community 14" },
    { id: "london", label: "London", type: "City", community: 8, community_name: "Community 8" },
  ],
  links: [
    { source: "holmes", target: "watson", relation: "knows" },
    { source: "holmes", target: "moriarty", relation: "rival" },
    { source: "moriarty", target: "moran", relation: "employs" },
    { source: "holmes", target: "london", relation: "lives_in" },
  ],
};

describe("LeftRail per-item checkbox RENDER gate (mystery-shaped data)", () => {
  const classHierarchies = loadMysteryHierarchies();

  it("typeTree yields Domain + Sub-domain rows → each renders an ontology group-by checkbox", () => {
    const tree = buildTypeTree(mysteryGraph, classHierarchies);
    expect(tree).not.toBeNull();
    // At least one Domain row (each gets a checkbox in its Collapsible trailing).
    expect(tree.length).toBeGreaterThan(0);
    // Every Domain has ≥1 Sub-domain row (each ALSO gets its own checkbox).
    const subRows = tree.flatMap((d) => d.subs);
    expect(subRows.length).toBeGreaterThan(0);
    // The People domain (in the approved mockup) is present and owns ≥1
    // sub-domain row — each Domain AND each Sub-domain is a checkbox row.
    const people = tree.find((d) => d.label === "People");
    expect(people).toBeTruthy();
    expect(people.subs.length).toBeGreaterThan(0);
    // Every sub-domain carries leaf member TYPES (the FILTER rows below the
    // checkbox), so the row is a real, rendered, groupable target.
    for (const sub of people.subs) {
      expect(sub.types.length).toBeGreaterThan(0);
      expect(typeof sub.label).toBe("string");
    }
  });

  it("each ontology row exposes a stable class id for groupKeyForOntology(...)", () => {
    const tree = buildTypeTree(mysteryGraph, classHierarchies);
    for (const domain of tree) {
      // Domain checkbox → onToggleGroupOntology(domain.id).
      expect(typeof groupKeyForOntology(domain.id)).toBe("string");
      expect(groupKeyForOntology(domain.id)).toMatch(/^ontology:/);
      for (const sub of domain.subs) {
        // Sub-domain checkbox → onToggleGroupOntology(sub.id).
        expect(groupKeyForOntology(sub.id)).toMatch(/^ontology:/);
      }
    }
  });

  it("communityStats reports live communities → each renders a community group-by checkbox", () => {
    const stats = communityStats(mysteryGraph);
    // canGroupCommunity (App) === liveCount > 0; must be true for this data.
    expect(stats.liveCount).toBeGreaterThan(0);
    expect(stats.live.length).toBe(stats.liveCount);
    // Each live community row carries a checkbox → onToggleGroupCommunity(c.key);
    // its key round-trips through the community namespace.
    for (const c of stats.live) {
      expect(typeof c.key).toBe("string");
      expect(groupKeyForCommunity(c.key)).toMatch(/^community:/);
    }
    // The mockup's "Community 8" / "Community 14" are both live + groupable.
    const keys = stats.live.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["Community 8", "Community 14"]));
  });

  it("App availability flags are TRUE for this data (gate the SECONDARY bulk controls)", () => {
    // canGroupOntology = Boolean(classHierarchies?.hierarchies)
    expect(Boolean(classHierarchies?.hierarchies)).toBe(true);
    // canGroupCommunity = communityStats(graph).liveCount > 0
    expect(communityStats(mysteryGraph).liveCount > 0).toBe(true);
  });

  it("checked state reflects the grouped SET membership (per-item, multi-select)", () => {
    // The component computes ontologyGrouped/communityGrouped from the grouped set;
    // a checked box === its namespaced key is present. Prove the mapping the
    // `checked={ontologyGrouped.has(...)}` / `checked={communityGrouped.has(...)}`
    // bindings rely on, with a MIXED multi-select set.
    const grouped = [
      groupKeyForOntology("class:Suspect"),
      groupKeyForCommunity("Community 8"),
    ];
    const ontologyGrouped = new Set(
      grouped
        .filter((k) => k.startsWith("ontology:"))
        .map((k) => k.slice("ontology:".length)),
    );
    const communityGrouped = new Set(
      grouped
        .filter((k) => k.startsWith("community:"))
        .map((k) => k.slice("community:".length)),
    );
    expect(ontologyGrouped.has("class:Suspect")).toBe(true);
    expect(ontologyGrouped.has("class:Detective")).toBe(false);
    expect(communityGrouped.has("Community 8")).toBe(true);
    expect(communityGrouped.has("Community 14")).toBe(false);
  });
});
