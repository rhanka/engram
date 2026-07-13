import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  computeGroupedGraph,
  computeGroupTransition,
  classIdsAtLevel,
  typeNamesInTaxonomy,
  ontologyLevelState,
  levelButtonView,
  ontologyAbsorption,
} from "../lib/groupBy.js";
import { mintCommunityNodeIds, mintTypeNodeIds } from "../lib/classNodes.js";
import { communityStats, nodeCommunity, nodeType, buildScene } from "../lib/graphAdapter.js";
import {
  createDefaultViewerState,
  toggleGroupOntology,
  toggleGroupType,
  toggleGroupCommunity,
  groupOntologyLevel,
  groupAllCommunities,
  clearOntologyGrouping,
  clearCommunityGrouping,
  hasOntologyGrouping,
  hasCommunityGrouping,
  splitGroupedKeys,
  ONTOLOGY_LEVELS,
} from "../lib/viewerState.js";

/**
 * B2 — the EXTRACTED, REAL App grouping chain (`computeGroupedGraph`) driven
 * end-to-end on MYSTERY-SHAPED data, plus the Type axis (§2), the tri-state bulk
 * button state mapping (§4), nesting absorption (§3) and the scope-local
 * ungroup-all (§4/§5). These are the spec's failing→passing tests: they would
 * FAIL before this change (no exported chain, no Type grouping, no tri-state /
 * absorption math) and PASS after it.
 *
 * The App wires `communityCtx` / `typeCtx` exactly as built here, so this suite
 * is the literal runtime path — not a re-implementation.
 */

// A mystery-shaped graph: Domain → Sub-domain class taxonomy with member_ids that
// MATCH graph node ids (the public-pack invariant), numeric+named communities,
// and typed entities so the Type axis has real members.
function mysteryGraph() {
  return {
    nodes: [
      // People domain
      { id: "holmes", label: "Sherlock Holmes", type: "Character", community: 8, community_name: "Hound" },
      { id: "watson", label: "John Watson", type: "Character", community: 8, community_name: "Hound" },
      { id: "moriarty", label: "Moriarty", type: "Character", community: 14, community_name: "Web" },
      { id: "yard", label: "Scotland Yard", type: "Organization", community: 8, community_name: "Hound" },
      // Place domain
      { id: "baker", label: "Baker Street", type: "Location", community: 8, community_name: "Hound" },
      { id: "moor", label: "Dartmoor", type: "Location", community: 14, community_name: "Web" },
    ],
    links: [
      { source: "holmes", target: "watson", relation: "assists", evidence_refs: ["e1"] },
      { source: "holmes", target: "moriarty", relation: "rival", evidence_refs: ["e2"] },
      { source: "holmes", target: "yard", relation: "consults", evidence_refs: ["e3"] },
      { source: "holmes", target: "baker", relation: "lives_in", evidence_refs: ["e4"] },
      { source: "moriarty", target: "moor", relation: "hides_in", evidence_refs: ["e5"] },
      { source: "watson", target: "moor", relation: "visits", evidence_refs: ["e6"] },
    ],
  };
}

// Taxonomy: Domain (level 0) → Sub-domain leaf classes (level 1) carrying
// member_ids + member_node_types. Mirrors the real mystery artifact shape.
function mysteryHierarchies() {
  return {
    schema: "graphify_ontology_class_hierarchies_v1",
    hierarchies: {
      mystery_class_taxonomy_v1: {
        root_class_ids: ["class:People", "class:Place"],
        classes_by_id: {
          "class:People": {
            id: "class:People",
            label: "People",
            level: 0,
            parent_id: null,
            child_ids: ["class:Person", "class:Organization"],
            member_node_types: [],
            member_ids: [],
          },
          "class:Person": {
            id: "class:Person",
            label: "Person",
            level: 1,
            parent_id: "class:People",
            child_ids: [],
            member_node_types: ["Character"],
            member_ids: ["holmes", "watson", "moriarty"],
          },
          "class:Organization": {
            id: "class:Organization",
            label: "Organization",
            level: 1,
            parent_id: "class:People",
            child_ids: [],
            member_node_types: ["Organization"],
            member_ids: ["yard"],
          },
          "class:Place": {
            id: "class:Place",
            label: "Place",
            level: 0,
            parent_id: null,
            child_ids: ["class:Location"],
            member_node_types: [],
            member_ids: [],
          },
          "class:Location": {
            id: "class:Location",
            label: "Location",
            level: 1,
            parent_id: "class:Place",
            child_ids: [],
            member_node_types: ["Location"],
            member_ids: ["baker", "moor"],
          },
        },
      },
    },
  };
}

// Faithful replica of App.svelte's `communityCtx` (GROUPED ∩ LIVE).
function communityCtxFor(graph, communityKeys) {
  if (!communityKeys.length) return null;
  const groupedSet = new Set(communityKeys);
  const live = communityStats(graph).live.filter((c) => groupedSet.has(c.key));
  if (live.length === 0) return null;
  const liveKeys = live.map((c) => c.key);
  const idByKey = mintCommunityNodeIds(liveKeys, new Set(graph.nodes.map((n) => n.id)));
  const toneKeyByKey = new Map(live.map((c) => [c.key, c.groupKey ?? c.key]));
  return {
    liveKeys,
    idByKey,
    communityOf: nodeCommunity,
    toneKeyOf: (k) => toneKeyByKey.get(k),
    labelOf: (k) => k,
  };
}

// Faithful replica of App.svelte's `typeCtx`.
function typeCtxFor(graph, typeNames) {
  if (!typeNames.length) return null;
  const idByKey = mintTypeNodeIds(typeNames, new Set(graph.nodes.map((n) => n.id)));
  return { typeNames, idByKey, typeOf: nodeType };
}

// The full App chain for a grouped-key set (what `groupedGraph` resolves to).
function groupedGraphFor(graph, classHierarchies, grouped) {
  const { communityKeys, typeNames } = splitGroupedKeys(grouped);
  return computeGroupedGraph({
    graph,
    classHierarchies,
    communityCtx: communityCtxFor(graph, communityKeys),
    typeCtx: typeCtxFor(graph, typeNames),
    grouped,
  });
}

describe("B2 §2 — ONTOLOGY per-item grouping regroups the graph (the fixed bug)", () => {
  it("checking a DOMAIN folds its whole subtree into the domain class node", () => {
    const graph = mysteryGraph();
    const ch = mysteryHierarchies();

    // Drive the SAME id the Domain checkbox passes (typeTree domain.id = root id).
    let state = createDefaultViewerState();
    state = toggleGroupOntology(state, "class:People");

    const out = groupedGraphFor(graph, ch, state.options.groupBy.grouped);
    const ids = out.nodes.map((n) => n.id);

    // Node count DROPS and every People member folded away.
    for (const member of ["holmes", "watson", "moriarty", "yard"]) {
      expect(ids, `${member} must fold under class:People`).not.toContain(member);
    }
    // The class group node is present + collapsed with its hidden count.
    const peopleNode = out.nodes.find((n) => n.id === "class:People");
    expect(peopleNode, "class:People fold node must be present").toBeTruthy();
    expect(peopleNode.collapsed).toBe(true);
    // 4 entity members + 2 descendant class nodes (Person, Organization) = 6.
    expect(peopleNode.hidden_node_count).toBe(6);
    // Place subtree untouched.
    expect(ids).toContain("baker");
    expect(ids).toContain("moor");
    expect(out.nodes.length).toBeLessThan(graph.nodes.length);
  });

  it("checking a SUB-DOMAIN leaf class folds only its members", () => {
    const graph = mysteryGraph();
    const ch = mysteryHierarchies();
    let state = createDefaultViewerState();
    state = toggleGroupOntology(state, "class:Person"); // leaf sub-domain

    const out = groupedGraphFor(graph, ch, state.options.groupBy.grouped);
    const ids = out.nodes.map((n) => n.id);
    for (const member of ["holmes", "watson", "moriarty"]) {
      expect(ids).not.toContain(member);
    }
    // Organization sibling + Place subtree stay visible.
    expect(ids).toContain("yard");
    expect(ids).toContain("baker");
    const personNode = out.nodes.find((n) => n.id === "class:Person");
    expect(personNode.hidden_node_count).toBe(3);
  });

  it("the collapsed graph builds a scene carrying the class fold node", () => {
    const graph = mysteryGraph();
    const out = groupedGraphFor(graph, mysteryHierarchies(), ["ontology:class:People"]);
    const scene = buildScene(out, { showWeakLinks: true });
    expect(scene.nodes.some((n) => n.ontology_node_kind === "class")).toBe(true);
  });
});

describe("B2 §2 — TYPE (leaf) grouping folds entities into their type", () => {
  it("checking a Type folds every entity of that `type` into a type node", () => {
    const graph = mysteryGraph();
    let state = createDefaultViewerState();
    state = toggleGroupType(state, "Character");

    const out = groupedGraphFor(graph, mysteryHierarchies(), state.options.groupBy.grouped);
    const ids = out.nodes.map((n) => n.id);
    // The 3 Characters folded away…
    for (const member of ["holmes", "watson", "moriarty"]) {
      expect(ids).not.toContain(member);
    }
    // …a Type fold node is present in their place…
    const typeNode = out.nodes.find((n) => n.type_node_kind === "type");
    expect(typeNode, "a Type fold node must be present").toBeTruthy();
    expect(typeNode.type_name).toBe("Character");
    expect(typeNode.collapsed).toBe(true);
    expect(typeNode.hidden_node_count).toBe(3);
    // …non-Character nodes stay visible.
    for (const kept of ["yard", "baker", "moor"]) expect(ids).toContain(kept);
    // The scene carries the type fold node.
    const scene = buildScene(out, { showWeakLinks: true });
    expect(scene.nodes.some((n) => n.type_node_kind === "type")).toBe(true);
  });

  it("mixing ontology + community + type folds all three at once", () => {
    const graph = mysteryGraph();
    let state = createDefaultViewerState();
    state = toggleGroupType(state, "Location"); // baker, moor
    state = toggleGroupOntology(state, "class:Organization"); // yard
    state = toggleGroupCommunity(state, "Hound"); // holmes, watson (+ baker/yard but those fold via other axes)

    const out = groupedGraphFor(graph, mysteryHierarchies(), state.options.groupBy.grouped);
    const kinds = out.nodes
      .map((n) => n.type_node_kind || n.community_node_kind || n.ontology_node_kind)
      .filter(Boolean)
      .sort();
    expect(kinds).toContain("type");
    expect(kinds).toContain("community");
    expect(kinds).toContain("class");
  });
});

describe("B2 §4 — tri-state bulk-button state mapping (none / partial / all)", () => {
  const ch = mysteryHierarchies();

  it("DOMAIN level: none → partial → all as classes get checked", () => {
    // Two domains: class:People, class:Place → total = 2 (none absorbed).
    let none = ontologyLevelState({ classHierarchies: ch, level: 0, checkedOntologyIds: new Set() });
    expect(none).toMatchObject({ state: "none", done: 0, total: 2 });

    let partial = ontologyLevelState({
      classHierarchies: ch,
      level: 0,
      checkedOntologyIds: new Set(["class:People"]),
    });
    expect(partial).toMatchObject({ state: "partial", done: 1, total: 2 });

    let all = ontologyLevelState({
      classHierarchies: ch,
      level: 0,
      checkedOntologyIds: new Set(["class:People", "class:Place"]),
    });
    expect(all).toMatchObject({ state: "all", done: 2, total: 2 });
  });

  it("TYPE level: total = distinct member_node_types, checked = grouped type names", () => {
    const types = typeNamesInTaxonomy(ch); // Character, Organization, Location
    expect(types.sort()).toEqual(["Character", "Location", "Organization"]);
    const partial = ontologyLevelState({
      classHierarchies: ch,
      level: 2,
      checkedTypeNames: new Set(["Character"]),
    });
    expect(partial).toMatchObject({ state: "partial", done: 1, total: 3 });
  });

  it("levelButtonView maps tri-state to DS variant + aria-pressed + badge (NEVER mixed)", () => {
    // NONE → secondary, aria-pressed=false, no badge (click groups the level).
    expect(levelButtonView({ state: "none", done: 0, total: 2 })).toEqual({
      variant: "secondary",
      ariaPressed: "false",
      showBadge: false,
      badge: null,
    });
    // ALL → primary, aria-pressed=true (click toggles OFF).
    expect(levelButtonView({ state: "all", done: 2, total: 2 })).toEqual({
      variant: "primary",
      ariaPressed: "true",
      showBadge: false,
      badge: null,
    });
    // PARTIAL → secondary, aria-pressed=false, badge "n/m" (click completes).
    expect(levelButtonView({ state: "partial", done: 1, total: 2 })).toEqual({
      variant: "secondary",
      ariaPressed: "false",
      showBadge: true,
      badge: "1/2",
    });
    // It is NEVER aria-pressed="mixed" / aria-checked anything.
    for (const s of ["none", "partial", "all"]) {
      const v = levelButtonView({ state: s, done: 1, total: 2 });
      expect(["true", "false"]).toContain(v.ariaPressed);
    }
  });

  it("bulk CLICK cycles none→all→none and partial→all (via state actions)", () => {
    let state = createDefaultViewerState();
    // none → click groups all domains.
    state = groupOntologyLevel(state, ONTOLOGY_LEVELS.domain, classIdsAtLevel(ch, 0));
    let ls = ontologyLevelState({
      classHierarchies: ch,
      level: 0,
      checkedOntologyIds: new Set(splitGroupedKeys(state.options.groupBy.grouped).ontologyClassIds),
    });
    expect(ls.state).toBe("all");
    // all → toggle OFF (clearOntologyGrouping).
    state = clearOntologyGrouping(state);
    ls = ontologyLevelState({
      classHierarchies: ch,
      level: 0,
      checkedOntologyIds: new Set(splitGroupedKeys(state.options.groupBy.grouped).ontologyClassIds),
    });
    expect(ls.state).toBe("none");
    // partial → completes to all in ONE click.
    state = toggleGroupOntology(createDefaultViewerState(), "class:People"); // partial
    state = groupOntologyLevel(state, ONTOLOGY_LEVELS.domain, classIdsAtLevel(ch, 0));
    ls = ontologyLevelState({
      classHierarchies: ch,
      level: 0,
      checkedOntologyIds: new Set(splitGroupedKeys(state.options.groupBy.grouped).ontologyClassIds),
    });
    expect(ls.state).toBe("all");
  });
});

describe("B2 §3 — nesting absorption", () => {
  const ch = mysteryHierarchies();

  it("a sub-domain absorbed by a grouped Domain is excluded + reports its parent", () => {
    const checked = new Set(["class:People"]); // domain grouped
    const abs = ontologyAbsorption(ch, checked);
    // class:Person is absorbed by class:People.
    expect(abs.get("class:Person")).toMatchObject({ absorbed: true, byLabel: "People" });
    expect(abs.get("class:Organization")).toMatchObject({ absorbed: true, byLabel: "People" });
    // class:Place (a different domain) is NOT absorbed.
    expect(abs.get("class:Place").absorbed).toBe(false);
  });

  it("level counts EXCLUDE absorbed classes (denominator shrinks)", () => {
    // With class:People grouped, the Sub-domain level still has Location as the
    // ONLY non-absorbed member (Person+Organization are absorbed by People).
    const ls = ontologyLevelState({
      classHierarchies: ch,
      level: 1,
      checkedOntologyIds: new Set(["class:People"]),
    });
    expect(ls.total).toBe(1); // only class:Location
    expect(ls.members).toEqual(["class:Location"]);
  });
});

describe("B2 §4/§5 — scope-local ungroup-all (disabled when nothing grouped)", () => {
  it("ontology ungroup-all clears ONLY ontology+type keys; community survives", () => {
    let state = createDefaultViewerState();
    state = toggleGroupOntology(state, "class:Person");
    state = toggleGroupType(state, "Location");
    state = toggleGroupCommunity(state, "Hound");
    expect(hasOntologyGrouping(state)).toBe(true);
    expect(hasCommunityGrouping(state)).toBe(true);

    state = clearOntologyGrouping(state);
    expect(hasOntologyGrouping(state)).toBe(false); // class + type both gone
    expect(hasCommunityGrouping(state)).toBe(true); // community untouched
    expect(splitGroupedKeys(state.options.groupBy.grouped).communityKeys).toEqual(["Hound"]);
  });

  it("community ungroup-all clears ONLY community keys; ontology survives", () => {
    let state = createDefaultViewerState();
    state = toggleGroupOntology(state, "class:Person");
    state = toggleGroupCommunity(state, "Hound");
    state = clearCommunityGrouping(state);
    expect(hasCommunityGrouping(state)).toBe(false);
    expect(hasOntologyGrouping(state)).toBe(true);
  });

  it("hasOntologyGrouping / hasCommunityGrouping are false by default (Ungroup all disabled)", () => {
    const state = createDefaultViewerState();
    expect(hasOntologyGrouping(state)).toBe(false);
    expect(hasCommunityGrouping(state)).toBe(false);
  });

  it("community FLAT bulk: groupAllCommunities then all-grouped predicate", () => {
    const graph = mysteryGraph();
    const liveKeys = communityStats(graph).live.map((c) => c.key);
    let state = groupAllCommunities(createDefaultViewerState(), liveKeys);
    const grouped = new Set(splitGroupedKeys(state.options.groupBy.grouped).communityKeys);
    expect(liveKeys.every((k) => grouped.has(k))).toBe(true);
  });
});

describe("B2 — real served mystery artifact (if present) folds a Domain end-to-end", () => {
  const candidates = [
    resolve(process.env.HOME ?? "", "src/graphify/.graphify/uat/b2-mystery"),
    resolve(
      process.env.HOME ?? "",
      "src/public-domaine-mystery-sagas-pack/.graphify/studio",
    ),
  ];
  const base = candidates.find(
    (p) => existsSync(resolve(p, "graph.json")) && existsSync(resolve(p, "class-hierarchies.json")),
  );
  const maybe = base ? it : it.skip;

  maybe("a Domain checkbox drops the node count against the served pack", () => {
    const graph = JSON.parse(readFileSync(resolve(base, "graph.json"), "utf8"));
    const ch = JSON.parse(readFileSync(resolve(base, "class-hierarchies.json"), "utf8"));
    const hs = ch.hierarchies[Object.keys(ch.hierarchies)[0]];
    const domainId = hs.root_class_ids[0];
    const out = computeGroupedGraph({
      graph,
      classHierarchies: ch,
      grouped: [`ontology:${domainId}`],
    });
    const node = out.nodes.find((n) => n.id === domainId);
    expect(node, `${domainId} fold node must be present`).toBeTruthy();
    expect(node.collapsed).toBe(true);
    expect(out.nodes.length).toBeLessThan(graph.nodes.length);
  });
});

/* ===========================================================================
 * Collapse/expand ANIMATION — computeGroupTransition (direction detection).
 *
 * PURE diff of (prev grouped keys, next grouped keys, prev fold-anchor map, next
 * fold-anchor map) into the transition descriptor GraphCanvas plays:
 *   - a target ADDED (grew, none removed)  → collapse (newly-folded children)
 *   - a target REMOVED (shrank, none added) → expand (newly-revealed children)
 *   - MIXED / no-op                          → null (hard cut, safety fallback)
 * ======================================================================== */
describe("computeGroupTransition — collapse/expand direction detection", () => {
  it("children newly FOLDED (none revealed) → collapse, anchored via the NEXT map", () => {
    const t = computeGroupTransition({
      prevFoldAnchors: new Map(),
      nextFoldAnchors: new Map([
        ["holmes", "class:People"],
        ["watson", "class:People"],
      ]),
    });
    expect(t).not.toBeNull();
    expect(t.direction).toBe("collapse");
    expect(t.anchorByNodeId.get("holmes")).toBe("class:People");
    expect(t.anchorByNodeId.get("watson")).toBe("class:People");
    expect(t.anchorByNodeId.size).toBe(2);
  });

  it("an incremental collapse only animates the NEWLY-folded children (delta)", () => {
    // People already folded; adding Villains folds moriarty. holmes/watson are
    // ALREADY hidden (present in prev), so they must NOT animate again.
    const t = computeGroupTransition({
      prevFoldAnchors: new Map([
        ["holmes", "class:People"],
        ["watson", "class:People"],
      ]),
      nextFoldAnchors: new Map([
        ["holmes", "class:People"],
        ["watson", "class:People"],
        ["moriarty", "class:Villains"],
      ]),
    });
    expect(t.direction).toBe("collapse");
    expect([...t.anchorByNodeId.keys()]).toEqual(["moriarty"]);
    expect(t.anchorByNodeId.get("moriarty")).toBe("class:Villains");
  });

  it("children newly REVEALED (none folded) → expand, anchored via the PREV map", () => {
    const t = computeGroupTransition({
      prevFoldAnchors: new Map([
        ["holmes", "class:People"],
        ["watson", "class:People"],
      ]),
      nextFoldAnchors: new Map(),
    });
    expect(t.direction).toBe("expand");
    expect(t.anchorByNodeId.get("holmes")).toBe("class:People");
    expect(t.anchorByNodeId.get("watson")).toBe("class:People");
    expect(t.anchorByNodeId.size).toBe(2);
  });

  it("a MIXED change (some folded AND some revealed) → null (hard cut fallback)", () => {
    const t = computeGroupTransition({
      prevFoldAnchors: new Map([["holmes", "class:People"]]),
      nextFoldAnchors: new Map([["moriarty", "class:Villains"]]),
    });
    expect(t).toBeNull();
  });

  it("a no-op change (identical fold maps) → null", () => {
    expect(
      computeGroupTransition({
        prevFoldAnchors: new Map([["holmes", "class:People"]]),
        nextFoldAnchors: new Map([["holmes", "class:People"]]),
      }),
    ).toBeNull();
  });

  it("robust to ASYNC fold landing: a key change that folds NOTHING yet → null", () => {
    // The grouped key changed but the artifact hasn't loaded, so the fold map is
    // still empty on both sides — no direction until the fold actually lands.
    expect(
      computeGroupTransition({
        prevFoldAnchors: new Map(),
        nextFoldAnchors: new Map(),
      }),
    ).toBeNull();
  });

  it("defaults are safe — no args → null", () => {
    expect(computeGroupTransition()).toBeNull();
  });
});
